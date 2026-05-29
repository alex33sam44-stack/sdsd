import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { buildProviderChain, AiProvider } from './ai.providers';
import type {
  AiAskInput,
  AiExplainInput,
  AiResponse,
  AiSuggestInput,
  AiSuggestion,
  AiTask,
} from './ai.types';

const SUPPORTED_LOCALES = new Set(['ar', 'en', 'fr', 'pt']);

const SYSTEM_PROMPT_BASE =
  'You are mwasalat, a transit assistant for Egyptian commuters. ' +
  'Be concise, accurate, and never invent station names or fares. ' +
  'When the user-supplied context lists a fare or duration, quote it; ' +
  'otherwise say it is not available yet rather than guessing. ' +
  'Avoid markdown unless explicitly asked. Avoid emojis except 🚌🚐 in casual contexts.';

interface CachedAnswer {
  task: AiTask;
  locale: string;
  fingerprint: string;
  text: string;
  provider: string;
  fallback: boolean;
  suggestions?: AiSuggestion[];
  expiresAt: number;
}

/**
 * Lightweight AI gateway: routes task-typed prompts through a
 * configurable provider chain (OpenAI → Anthropic → OpenRouter →
 * NoopProvider) with an in-memory LRU cache for identical prompts.
 *
 * The service never touches the database directly. Callers are
 * expected to pre-resolve any catalog facts (station/line/fare) and
 * pass them as `context`, which the service serializes into the
 * prompt. This keeps the hot path predictable and the prompt
 * deterministic enough to cache across users.
 */
@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private providers: AiProvider[] = [];
  private readonly cache = new Map<string, CachedAnswer>();
  private readonly CACHE_LIMIT = 500;
  private readonly CACHE_TTL_MS = 5 * 60_000;

  onModuleInit(): void {
    this.providers = buildProviderChain();
    this.logger.log(`AI provider chain: ${this.providers.map((p) => p.name).join(' → ')}`);
  }

  async ask(input: AiAskInput): Promise<AiResponse> {
    const locale = this.normalizeLocale(input.locale);
    const userPrompt = [
      `Question: ${input.question}`,
      input.context && Object.keys(input.context).length
        ? `\nKnown context (JSON): ${safeJson(input.context)}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
    return this.run('ask', locale, userPrompt);
  }

  async explain(input: AiExplainInput): Promise<AiResponse> {
    const locale = this.normalizeLocale(input.locale);
    const facts = [
      `from=${input.fromName}`,
      `to=${input.toName}`,
      input.vehicle ? `vehicle=${input.vehicle}` : null,
      input.durationMinutes != null ? `durationMinutes=${input.durationMinutes}` : null,
      input.fareEgp != null ? `fareEgp=${input.fareEgp}` : null,
      input.steps?.length ? `steps=${input.steps.join(' → ')}` : null,
    ]
      .filter(Boolean)
      .join(', ');
    const userPrompt =
      'Write a single paragraph (≤45 words) describing this commute for a share caption. ' +
      'Mention duration and fare only if provided in the facts. ' +
      'Do not add advice or warnings. ' +
      `\nFacts: ${facts}`;
    return this.run('explain', locale, userPrompt);
  }

  async suggest(input: AiSuggestInput): Promise<AiResponse> {
    const locale = this.normalizeLocale(input.locale);
    const userPrompt =
      'Propose between 1 and 3 alternative ways to commute. ' +
      'Each suggestion should be ONE line in this exact format:\n' +
      '  • <label> — <vehicle>, ~<minutes>min, ~<fare> EGP — <one-line rationale>\n' +
      'If you do not know an estimate, omit it; do NOT invent numbers.\n' +
      `From: ${input.fromName}\nTo: ${input.toName}` +
      (input.departAt ? `\nDeparting around: ${input.departAt}` : '');
    const response = await this.run('suggest', locale, userPrompt);
    response.suggestions = parseSuggestions(response.text);
    return response;
  }

  // ------------------------- internals -------------------------

  private async run(task: AiTask, locale: string, userPrompt: string): Promise<AiResponse> {
    const fingerprint = `${task}|${locale}|${userPrompt}`;
    const cached = this.cache.get(fingerprint);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return {
        task: cached.task,
        text: cached.text,
        provider: `${cached.provider}+cache`,
        durationMs: 0,
        fallback: cached.fallback,
        suggestions: cached.suggestions,
      };
    }

    const start = now;
    let lastError: Error | undefined;
    for (const provider of this.providers) {
      try {
        const result = await provider.invoke({
          task,
          locale,
          systemPrompt: SYSTEM_PROMPT_BASE,
          userPrompt,
          maxOutputTokens: task === 'explain' ? 200 : 400,
          temperature: task === 'suggest' ? 0.4 : 0.2,
        });
        const response: AiResponse = {
          task,
          text: result.text,
          provider: result.provider,
          durationMs: Date.now() - start,
          fallback: !!provider.fallback,
        };
        this.remember(fingerprint, response, task, locale);
        return response;
      } catch (err) {
        lastError = err as Error;
        this.logger.warn(`AI provider ${provider.name} failed: ${(err as Error).message}`);
      }
    }
    // The Noop provider in the chain guarantees we never hit this
    // branch in practice; if we somehow do, surface a controlled
    // response rather than 5xx-ing.
    return {
      task,
      text: 'AI service is temporarily unavailable. Please retry shortly.',
      provider: 'unavailable',
      durationMs: Date.now() - start,
      fallback: true,
    };
  }

  private normalizeLocale(value: string | undefined): string {
    if (!value) return 'ar';
    const normalized = value.toLowerCase().slice(0, 5);
    if (SUPPORTED_LOCALES.has(normalized)) return normalized;
    const short = normalized.split(/[-_]/)[0];
    return SUPPORTED_LOCALES.has(short) ? short : 'ar';
  }

  private remember(fingerprint: string, response: AiResponse, task: AiTask, locale: string): void {
    if (this.cache.size >= this.CACHE_LIMIT) {
      const first = this.cache.keys().next().value;
      if (first !== undefined) this.cache.delete(first);
    }
    this.cache.set(fingerprint, {
      task,
      locale,
      fingerprint,
      text: response.text,
      provider: response.provider,
      fallback: response.fallback,
      suggestions: response.suggestions,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 1500);
  } catch {
    return '{}';
  }
}

function parseSuggestions(text: string): AiSuggestion[] {
  // Each line: "• <label> — <vehicle>, ~<m>min, ~<f> EGP — <rationale>"
  const out: AiSuggestion[] = [];
  for (const raw of text.split(/\n+/)) {
    const line = raw.replace(/^[-•*]\s*/, '').trim();
    if (!line) continue;
    const [head, rationale] = line.split(/—|\s-\s/).map((s) => s.trim());
    if (!head) continue;
    const label = head.split(/[—,]/)[0].trim();
    const vehicleMatch = head.match(/\b(microbus|bus|minibus|train|metro|taxi|uber|tuktuk)\b/i);
    const minMatch = head.match(/~?\s*(\d+)\s*min/i);
    const fareMatch = head.match(/~?\s*(\d+)\s*(?:EGP|le|جنيه)/i);
    out.push({
      label,
      vehicle: vehicleMatch?.[1]?.toLowerCase(),
      estimateMinutes: minMatch ? Number(minMatch[1]) : undefined,
      estimateFare: fareMatch ? Number(fareMatch[1]) : undefined,
      rationale: rationale || undefined,
    });
    if (out.length >= 3) break;
  }
  return out;
}
