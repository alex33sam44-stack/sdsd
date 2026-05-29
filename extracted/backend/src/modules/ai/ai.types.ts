/**
 * AI gateway domain types.
 *
 * The platform exposes a small, opinionated AI surface focused on
 * the transit use cases users actually run into:
 *
 *   - "ask"    : answer a freeform commute question grounded on the
 *                catalog (stations, lines, stops, intercity routes).
 *   - "explain": turn a planner result into a human-readable
 *                paragraph for share captions and OG previews.
 *   - "suggest": propose 1–3 alternative routes or modes given a
 *                from/to pair, biased to the user's locale.
 *
 * The gateway is provider-agnostic; provider selection mirrors the
 * i18n stack (OpenAI / Anthropic / OpenRouter / a deterministic
 * NoopProvider that ships a useful canned response when no API key
 * is configured). This keeps every environment functional without
 * external network access.
 */

export type AiTask = 'ask' | 'explain' | 'suggest';

export interface AiAskInput {
  question: string;
  /** Optional context the planner already computed (route/fare/etc.). */
  context?: Record<string, unknown>;
  /** Override target locale; otherwise the request locale is used. */
  locale?: string;
}

export interface AiExplainInput {
  fromName: string;
  toName: string;
  durationMinutes?: number;
  fareEgp?: number;
  vehicle?: string;
  steps?: string[];
  locale?: string;
}

export interface AiSuggestInput {
  fromName: string;
  toName: string;
  /** ISO 8601 timestamp of the desired departure. */
  departAt?: string;
  locale?: string;
}

export interface AiResponse {
  task: AiTask;
  /** Human-readable answer in the requested locale. */
  text: string;
  /** Provider id that produced the answer. */
  provider: string;
  /** Wall-clock latency in ms (server side). */
  durationMs: number;
  /** True when the response came from the deterministic fallback. */
  fallback: boolean;
  /** Optional structured suggestions (only set for 'suggest'). */
  suggestions?: AiSuggestion[];
}

export interface AiSuggestion {
  label: string;
  vehicle?: string;
  estimateMinutes?: number;
  estimateFare?: number;
  rationale?: string;
}
