import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EGYPT_CATALOG, CatalogEntry } from './local-search.catalog';
import {
  confidenceBand,
  detectHubFromQuery,
  haversineKm,
  hubForCoord,
  normalize,
  pickSuggestions,
  tokenScore,
} from './local-search.normalize';
import type {
  LocalSearchHit,
  LocalSearchHub,
  LocalSearchKind,
  LocalSearchQuery,
  LocalSearchResponse,
} from './local-search.types';

const DEFAULT_LIMIT = 5;
const SUGGESTION_THRESHOLD = 0.5; // when top hit < this, we surface "did you mean"

@Injectable()
export class LocalSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(tenantId: string | null, query: LocalSearchQuery): Promise<LocalSearchResponse> {
    const start = Date.now();
    const q = (query.q ?? '').trim();
    const normalized = normalize(q);
    if (!q) {
      return { query: q, normalized, hits: [], source: 'mixed', durationMs: 0 };
    }

    const limit = Math.min(50, Math.max(1, query.limit ?? DEFAULT_LIMIT));
    const restrictKind = query.kind;
    const detectedHub = detectHubFromQuery(q);
    const hubFilter = query.hub ?? detectedHub;

    const dbHits = await this.searchDb(tenantId, q, normalized, restrictKind);
    const catalogHits = this.searchCatalog(q, normalized, restrictKind);

    let merged = [...dbHits, ...catalogHits];

    // Hub-aware ranking: when the query (or caller) anchors a hub,
    // boost hits whose own coordinate sits inside that hub. We do
    // NOT filter — boosting only — so cross-hub matches still
    // surface for users searching for, say, an Alexandria fare from
    // Cairo. Use `query.hub` to enforce a hard filter instead.
    if (hubFilter) {
      merged = merged.map((h) => {
        const ownHub = h.hub ?? hubForCoord(h.lat, h.lng);
        if (ownHub && ownHub === hubFilter) {
          return { ...h, score: Math.min(1, h.score + 0.1), hub: ownHub };
        }
        return { ...h, hub: ownHub };
      });
    }

    if (query.hub) {
      // Hard filter: caller asked for a single hub, drop everything else.
      merged = merged.filter((h) => (h.hub ?? '') === query.hub);
    }

    if (query.near) {
      merged = merged
        .map((h) => {
          if (h.lat == null || h.lng == null) return h;
          const d = haversineKm(query.near!, { lat: h.lat, lng: h.lng });
          // up to +0.15 boost for hits within 5km
          const proximityBoost = Math.max(0, 0.15 - d * 0.03);
          return { ...h, score: Math.min(1, h.score + proximityBoost) };
        });
    }

    merged.sort((a, b) => b.score - a.score);

    // Per-kind diversification so a single popular term doesn't push
    // out lines/landmarks of equal relevance.
    const perKind = new Map<LocalSearchKind, number>();
    const limited: LocalSearchHit[] = [];
    for (const hit of merged) {
      const taken = perKind.get(hit.kind) ?? 0;
      if (taken >= limit) continue;
      perKind.set(hit.kind, taken + 1);
      // Backfill optional fields without touching anything required.
      const enriched: LocalSearchHit = {
        ...hit,
        confidence: confidenceBand(hit.score),
      };
      limited.push(enriched);
    }

    // Suggestions when nothing satisfying came back.
    const suggestions =
      limited.length === 0 || (limited[0]?.score ?? 0) < SUGGESTION_THRESHOLD
        ? this.computeSuggestions(q, restrictKind)
        : undefined;

    const response: LocalSearchResponse = {
      query: q,
      normalized,
      hits: limited,
      source: dbHits.length && catalogHits.length ? 'mixed' : dbHits.length ? 'db' : 'catalog',
      durationMs: Date.now() - start,
    };

    if (detectedHub) response.detectedHub = detectedHub;
    if (suggestions && suggestions.length) response.suggestions = suggestions;
    return response;
  }

  // ---------- internals ----------

  private async searchDb(
    tenantId: string | null,
    rawQuery: string,
    normalized: string,
    restrictKind?: LocalSearchKind,
  ): Promise<LocalSearchHit[]> {
    if (!tenantId) return [];
    const tokens = normalized.split(/\s+/).filter((t) => t.length >= 2);
    if (tokens.length === 0) return [];

    // Fan-out: stations / lines / route stops. We use a simple
    // contains-OR query and re-rank in-memory; for large tenants
    // we'd switch to MySQL FULLTEXT but that change is out of scope.
    const [stations, lines, stops] = await Promise.all([
      restrictKind && restrictKind !== 'station'
        ? Promise.resolve([])
        : this.prisma.station.findMany({
            where: {
              tenantId,
              OR: tokens.map((t) => ({ name: { contains: t } })),
            },
            take: 25,
          }),
      restrictKind && restrictKind !== 'line'
        ? Promise.resolve([])
        : this.prisma.line.findMany({
            where: {
              tenantId,
              OR: tokens.map((t) => ({ destination: { contains: t } })),
            },
            include: { station: { select: { id: true, name: true } } },
            take: 25,
          }),
      restrictKind && restrictKind !== 'stop'
        ? Promise.resolve([])
        : this.prisma.routeStop.findMany({
            where: {
              tenantId,
              OR: tokens.map((t) => ({ name: { contains: t } })),
            },
            take: 25,
          }),
    ]);

    const hits: LocalSearchHit[] = [];

    for (const s of stations as any[]) {
      hits.push({
        id: s.id,
        kind: 'station',
        name: s.name,
        matchedAliases: [s.name],
        score: tokenScore(rawQuery, s.name) + 0.05, // slight boost for canonical entities
        lat: s.lat,
        lng: s.lng,
        area: s.area ?? undefined,
        href: `/station/${s.id}`,
        hub: hubForCoord(s.lat, s.lng),
        provider: 'local-search-db',
      });
    }

    for (const l of lines as any[]) {
      hits.push({
        id: l.id,
        kind: 'line',
        name: l.destination,
        matchedAliases: [l.destination],
        score: tokenScore(rawQuery, l.destination),
        area: l.station?.name,
        href: l.station ? `/route/${l.station.id}/${l.id}` : undefined,
        provider: 'local-search-db',
      });
    }

    for (const stop of stops as any[]) {
      hits.push({
        id: stop.id,
        kind: 'stop',
        name: stop.name,
        matchedAliases: [stop.name],
        score: tokenScore(rawQuery, stop.name),
        lat: stop.lat,
        lng: stop.lng,
        hub: hubForCoord(stop.lat, stop.lng),
        provider: 'local-search-db',
      });
    }

    return hits.filter((h) => h.score > 0.05);
  }

  private searchCatalog(
    rawQuery: string,
    normalized: string,
    restrictKind?: LocalSearchKind,
  ): LocalSearchHit[] {
    const hits: LocalSearchHit[] = [];
    for (const entry of EGYPT_CATALOG) {
      if (restrictKind && entry.kind !== restrictKind) continue;
      const candidates = [entry.name, ...entry.aliases];
      let best = 0;
      const matched: string[] = [];
      for (const c of candidates) {
        const s = tokenScore(rawQuery, c);
        if (s > 0.3) matched.push(c);
        if (s > best) best = s;
      }
      // Substring fallback: if we still didn't match, accept long
      // substring containment in the normalized form.
      if (best < 0.3) {
        const normCand = candidates.map((c) => normalize(c));
        if (normCand.some((c) => c.includes(normalized) && normalized.length >= 3)) {
          best = 0.55;
          matched.push(entry.name);
        }
      }
      if (best > 0.3) {
        // Pick a Latin alternate name from aliases when the canonical
        // name is in Arabic, and vice-versa, so SPAs can show both.
        const isArabicCanonical = /[\u0600-\u06FF]/.test(entry.name);
        const alternateName = entry.aliases.find((a) =>
          isArabicCanonical ? !/[\u0600-\u06FF]/.test(a) : /[\u0600-\u06FF]/.test(a),
        );
        hits.push({
          id: entry.id,
          kind: entry.kind,
          name: entry.name,
          matchedAliases: matched,
          score: best,
          lat: entry.lat,
          lng: entry.lng,
          area: entry.area,
          alternateName,
          hub: hubForCoord(entry.lat, entry.lng),
          provider: 'local-search-catalog',
        });
      }
    }
    return hits;
  }

  /**
   * Compute "did you mean" suggestions from the curated catalog.
   * Uses Damerau–Levenshtein distance against canonical names +
   * aliases so typos like "ranses" or "midan tahir" still surface a
   * useful list.
   */
  private computeSuggestions(rawQuery: string, restrictKind?: LocalSearchKind): string[] {
    const candidates: string[] = [];
    for (const entry of EGYPT_CATALOG) {
      if (restrictKind && entry.kind !== restrictKind) continue;
      candidates.push(entry.name, ...entry.aliases);
    }
    return pickSuggestions(rawQuery, candidates, 5);
  }
}

/* eslint-disable @typescript-eslint/no-unused-vars */
// Re-exported for tests that want to peek at the catalog without
// pulling the full module — keeps the test fixture trivial.
export { EGYPT_CATALOG } from './local-search.catalog';
export type { CatalogEntry } from './local-search.catalog';

// Re-export the additive hub helpers so consumers can use them
// without having to import the normalize file directly. Existing
// re-exports above are unchanged.
export { hubForCoord, detectHubFromQuery, confidenceBand, pickSuggestions } from './local-search.normalize';
