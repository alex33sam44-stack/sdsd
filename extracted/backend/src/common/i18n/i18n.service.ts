import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_LOCALE,
  Locale,
  SOURCE_LOCALE,
  SUPPORTED_LOCALES,
  TRANSLATABLE_FIELDS,
} from './i18n.types';
import {
  buildProviderChain,
  hashSource,
  ITranslationProvider,
  TranslationResult,
} from './translation-providers';

interface TranslateOptions {
  /** Skip cache write (used for hot-path lookups when DB is read-only). */
  cacheOnly?: boolean;
  /** Tenant scope for entity translations and overrides. */
  tenantId?: string | null;
  /** Source locale of the input. Defaults to platform source (ar). */
  from?: Locale;
}

interface EntityTranslateInput {
  entityType: string;
  entityId: string;
  field: string;
  value: string | null | undefined;
}

/**
 * The runtime localization service.
 *
 * Responsibilities:
 *   - Translate any free-text into any supported locale, hitting a
 *     three-layer cache: in-memory LRU → DB cache → external provider.
 *   - Translate DB entities (Station, Line, RouteStop, City, …) by
 *     consulting the `translations` table first, then falling back to
 *     auto-translation (and persisting the result).
 *   - Apply curated `i18n_overrides` so admins can hand-fix UI strings
 *     without touching the frozen frontend.
 *
 * The cache is intentionally simple: we want correctness and zero
 * external dependency by default. When no provider is configured, the
 * NoopProvider returns the source string and we mark the row as
 * `quality='passthrough'` so the dashboard can surface untranslated
 * content for human curation.
 */
@Injectable()
export class I18nService implements OnModuleInit {
  private readonly logger = new Logger(I18nService.name);
  private providers: ITranslationProvider[] = [];

  /** Tiny LRU cache to avoid re-hitting MySQL on every request. */
  private readonly memCache = new Map<string, string>();
  private readonly memCacheLimit = 5000;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.providers = buildProviderChain();
    this.logger.log(
      `Translation provider chain: ${this.providers.map((p) => p.name).join(' → ')}`,
    );
  }

  /** Returns supported locales for the public /api/i18n/locales endpoint. */
  getSupportedLocales(): readonly Locale[] {
    return SUPPORTED_LOCALES;
  }

  /**
   * Translate a single piece of free text. Used for chat messages, share
   * captions, validation errors, suggestions, and everything else that
   * does not have a dedicated entity row.
   */
  async translateText(
    text: string,
    target: Locale,
    options: TranslateOptions = {},
  ): Promise<string> {
    const trimmed = text?.trim();
    if (!trimmed) return text ?? '';
    const from = options.from ?? SOURCE_LOCALE;
    if (target === from) return text;

    // 0. tenant override
    const override = await this.lookupOverride(trimmed, from, target, options.tenantId ?? null);
    if (override) return override;

    const memKey = `${from}:${target}:${hashSource(trimmed, from)}`;
    const cached = this.memCache.get(memKey);
    if (cached !== undefined) return cached;

    // 1. shared translation cache
    const sourceHash = hashSource(trimmed, from);
    const dbCached = await this.prisma.translationCache.findUnique({
      where: {
        sourceHash_sourceLocale_targetLocale: {
          sourceHash,
          sourceLocale: from,
          targetLocale: target,
        },
      },
    });
    if (dbCached) {
      this.touchCache(dbCached.id).catch(() => undefined);
      this.rememberMem(memKey, dbCached.translatedText);
      return dbCached.translatedText;
    }

    // 2. external provider
    const result = await this.runProviders({ text: trimmed, from, to: target });
    const persisted = result.text;

    if (!options.cacheOnly && result.provider !== 'noop') {
      await this.prisma.translationCache
        .create({
          data: {
            sourceHash,
            sourceLocale: from,
            targetLocale: target,
            sourceText: trimmed,
            translatedText: persisted,
            provider: result.provider,
          },
        })
        .catch((err) =>
          this.logger.warn(
            `failed to cache translation (${from}→${target}, provider=${result.provider}): ${err.message}`,
          ),
        );
    }

    this.rememberMem(memKey, persisted);
    return persisted;
  }

  /**
   * Translate a batch of entity fields. The hot path for /api/stations,
   * /api/lines, /api/og, etc. Returns a map keyed by
   * `${entityType}:${entityId}:${field}` so callers can stitch values
   * back into their response bodies efficiently.
   */
  async translateEntities(
    inputs: EntityTranslateInput[],
    target: Locale,
    options: TranslateOptions = {},
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (target === (options.from ?? SOURCE_LOCALE)) {
      for (const i of inputs) if (i.value) out.set(keyOf(i), i.value);
      return out;
    }

    const allowed = inputs.filter((i) => isFieldTranslatable(i.entityType, i.field) && !!i.value);
    if (allowed.length === 0) return out;

    // 1. lookup cached entity translations
    const stored = await this.prisma.translation.findMany({
      where: {
        locale: target,
        OR: allowed.map((i) => ({
          entityType: i.entityType,
          entityId: i.entityId,
          field: i.field,
        })),
      },
    });
    const storedMap = new Map(
      stored.map((t) => [`${t.entityType}:${t.entityId}:${t.field}`, t]),
    );

    const missing: EntityTranslateInput[] = [];
    for (const item of allowed) {
      const k = keyOf(item);
      const hit = storedMap.get(k);
      // If stored translation was made from the *current* source value,
      // serve it; otherwise the source changed — re-translate.
      if (hit && hit.sourceHash === hashSource(item.value!, options.from ?? SOURCE_LOCALE)) {
        out.set(k, hit.value);
      } else {
        missing.push(item);
      }
    }

    if (missing.length === 0) return out;

    // 2. fill in missing via the text translator (which itself uses the
    // shared text cache — so common phrases like "محطة" cost ~0).
    await Promise.all(
      missing.map(async (item) => {
        const translated = await this.translateText(item.value!, target, options);
        out.set(keyOf(item), translated);
        const sourceHash = hashSource(item.value!, options.from ?? SOURCE_LOCALE);
        await this.prisma.translation
          .upsert({
            where: {
              entityType_entityId_field_locale: {
                entityType: item.entityType,
                entityId: item.entityId,
                field: item.field,
                locale: target,
              },
            },
            update: { value: translated, sourceHash, source: 'machine', quality: 'auto' },
            create: {
              tenantId: options.tenantId ?? null,
              entityType: item.entityType,
              entityId: item.entityId,
              field: item.field,
              locale: target,
              value: translated,
              sourceHash,
              sourceLocale: options.from ?? SOURCE_LOCALE,
              source: 'machine',
              quality: 'auto',
            },
          })
          .catch((err) =>
            this.logger.warn(
              `failed to persist entity translation ${keyOf(item)}@${target}: ${err.message}`,
            ),
          );
      }),
    );

    return out;
  }

  /**
   * Walk an arbitrary JS structure (request body or response payload),
   * translating every field listed in TRANSLATABLE_FIELDS in-place
   * based on a heuristic: the structure must carry an `id`.
   *
   * Used by the response interceptor — it does not introspect the
   * Prisma model, it just trusts the field names and the presence of
   * an `id`. False positives are harmless because untranslatable
   * fields aren't in the allow-list.
   */
  async localizeResponse(payload: unknown, target: Locale, tenantId?: string | null): Promise<unknown> {
    if (target === SOURCE_LOCALE || payload == null) return payload;
    const inputs: EntityTranslateInput[] = [];
    const visit = (node: unknown, hint?: string) => {
      if (!node) return;
      if (Array.isArray(node)) {
        for (const item of node) visit(item, hint);
        return;
      }
      if (typeof node !== 'object') return;
      const obj = node as Record<string, unknown>;
      const entityType = inferEntityType(obj, hint);
      if (entityType && typeof obj.id === 'string') {
        const fields = TRANSLATABLE_FIELDS[entityType] ?? [];
        for (const f of fields) {
          if (typeof obj[f] === 'string' && (obj[f] as string).trim()) {
            inputs.push({ entityType, entityId: obj.id, field: f, value: obj[f] as string });
          }
        }
      }
      for (const [k, v] of Object.entries(obj)) {
        if (v && typeof v === 'object') visit(v, k);
      }
    };
    visit(payload);
    if (inputs.length === 0) return payload;
    const map = await this.translateEntities(inputs, target, { tenantId });
    // apply
    const apply = (node: unknown, hint?: string) => {
      if (Array.isArray(node)) {
        for (const item of node) apply(item, hint);
        return;
      }
      if (!node || typeof node !== 'object') return;
      const obj = node as Record<string, unknown>;
      const entityType = inferEntityType(obj, hint);
      if (entityType && typeof obj.id === 'string') {
        const fields = TRANSLATABLE_FIELDS[entityType] ?? [];
        for (const f of fields) {
          const k = `${entityType}:${obj.id}:${f}`;
          if (map.has(k)) obj[f] = map.get(k);
        }
      }
      for (const [k, v] of Object.entries(obj)) if (v && typeof v === 'object') apply(v, k);
    };
    apply(payload);
    return payload;
  }

  /** Fetch the active overrides bundle for the runtime DOM overlay. */
  async getOverrideBundle(target: Locale, tenantId?: string | null): Promise<Record<string, string>> {
    if (target === SOURCE_LOCALE) return {};
    const rows = await this.prisma.i18nOverride.findMany({
      where: {
        targetLocale: target,
        isActive: true,
        OR: [{ tenantId: null }, ...(tenantId ? [{ tenantId }] : [])],
      },
    });
    const out: Record<string, string> = {};
    for (const row of rows) out[row.sourceText] = row.translatedText;
    return out;
  }

  // ---------------- private helpers ----------------

  private async lookupOverride(
    text: string,
    from: Locale,
    target: Locale,
    tenantId: string | null,
  ): Promise<string | null> {
    const sourceHash = hashSource(text, from);
    const row = await this.prisma.i18nOverride.findFirst({
      where: {
        sourceHash,
        targetLocale: target,
        isActive: true,
        OR: [{ tenantId: null }, ...(tenantId ? [{ tenantId }] : [])],
      },
      orderBy: { tenantId: 'desc' }, // tenant-scoped wins over global
    });
    return row?.translatedText ?? null;
  }

  private async runProviders(req: { text: string; from: Locale; to: Locale }): Promise<TranslationResult> {
    for (const provider of this.providers) {
      if (!provider.supports(req.from, req.to)) continue;
      try {
        return await provider.translate(req);
      } catch (err) {
        this.logger.warn(`provider ${provider.name} failed: ${(err as Error).message}`);
      }
    }
    return { text: req.text, provider: 'noop' };
  }

  private async touchCache(id: string): Promise<void> {
    await this.prisma.translationCache.update({
      where: { id },
      data: { hitCount: { increment: 1 }, lastUsedAt: new Date() },
    });
  }

  private rememberMem(key: string, value: string): void {
    if (this.memCache.size >= this.memCacheLimit) {
      const first = this.memCache.keys().next().value;
      if (first !== undefined) this.memCache.delete(first);
    }
    this.memCache.set(key, value);
  }

  /** Default locale is exported for tests/tools. */
  static get default(): Locale {
    return DEFAULT_LOCALE;
  }
}

function isFieldTranslatable(entityType: string, field: string): boolean {
  return (TRANSLATABLE_FIELDS[entityType] ?? []).includes(field);
}

function keyOf(i: EntityTranslateInput): string {
  return `${i.entityType}:${i.entityId}:${i.field}`;
}

/**
 * Heuristics:
 *   - If object has __entity, trust it.
 *   - Otherwise, infer from container key: `stations`→Station,
 *     `lines`→Line, `stops`/`routeStops`→RouteStop, `city`→City.
 *   - Last resort: peek at known field shape.
 */
function inferEntityType(obj: Record<string, unknown>, hint?: string): string | null {
  const explicit = obj.__entity;
  if (typeof explicit === 'string' && explicit in TRANSLATABLE_FIELDS) return explicit;
  if (hint) {
    const map: Record<string, string> = {
      station: 'Station',
      stations: 'Station',
      line: 'Line',
      lines: 'Line',
      stop: 'RouteStop',
      stops: 'RouteStop',
      routeStop: 'RouteStop',
      routeStops: 'RouteStop',
      city: 'City',
      cities: 'City',
      layout: 'StationLayout',
      layouts: 'StationLayout',
      zone: 'LayoutZone',
      zones: 'LayoutZone',
      favorite: 'Favorite',
      favorites: 'Favorite',
      tenant: 'Tenant',
      tenants: 'Tenant',
    };
    if (map[hint]) return map[hint];
  }
  // shape-based last resort
  if (typeof obj.lat === 'number' && typeof obj.lng === 'number' && typeof obj.name === 'string') {
    if ('destination' in obj) return null; // ambiguous
    return 'Station';
  }
  if (typeof obj.destination === 'string') return 'Line';
  if (typeof obj.position === 'number' && typeof obj.name === 'string') return 'RouteStop';
  return null;
}
