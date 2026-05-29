/**
 * Egypt local search domain types.
 *
 * The platform is frozen on the frontend so this module powers a
 * standalone /api/local-search endpoint that the SPA can call. It
 * answers queries like "ميدان رمسيس" / "midan ramses" / "ramses sq"
 * with the same shortlist of stations, lines, hubs and landmarks.
 *
 * Sources:
 *   - DB stations / lines / route stops (when present)
 *   - A curated landmark catalogue shipped in this module so the
 *     search works on a fresh DB before any tenant adds content.
 *
 * Backward-compatibility contract:
 *   - Every NEW field on LocalSearchHit / LocalSearchResponse is
 *     optional. Old clients that only consume the original shape
 *     keep working unchanged.
 *   - No existing field has been renamed, removed, or had its
 *     semantics changed.
 */
export type LocalSearchKind = 'station' | 'line' | 'stop' | 'landmark' | 'city';

/**
 * Hub identifier — coarse geographic grouping used to anchor
 * "Cairo / Giza / Alexandria" matching without forcing a tenant
 * scope. Empty string means the hit is hub-agnostic.
 */
export type LocalSearchHub = 'cairo' | 'giza' | 'alexandria' | 'delta' | 'upper-egypt' | 'sinai' | 'red-sea' | '';

export interface LocalSearchHit {
  /** Stable identifier per kind (DB id for stations/lines/stops, slug for landmarks/cities). */
  id: string;
  kind: LocalSearchKind;
  /** Best-effort localized display name (translated by the i18n interceptor downstream). */
  name: string;
  /** Aliases that matched the query (Arabic, English, franko/transliterated). */
  matchedAliases: string[];
  /** 0..1 — how confident we are in the match. (Original field, kept stable.) */
  score: number;
  /** Optional latitude/longitude when the entity is geo-located. */
  lat?: number;
  lng?: number;
  /** Optional area / city / governorate label. */
  area?: string;
  /** When the hit is a station/line and the user can act on it. */
  href?: string;
  // ---------------- additive (optional) fields ----------------
  /**
   * Confidence band derived from `score`:
   *   high   ≥ 0.75
   *   medium ≥ 0.45
   *   low    < 0.45
   * Provided as a friendly companion to the numeric `score`.
   */
  confidence?: 'high' | 'medium' | 'low';
  /** Coarse geographic grouping (cairo / giza / …). */
  hub?: LocalSearchHub;
  /** Display name in the alternate script (Arabic ↔ Latin), when known. */
  alternateName?: string;
  /** Provider that produced the hit; defaults to 'local-search-catalog'/'local-search-db'. */
  provider?: string;
}

export interface LocalSearchQuery {
  q: string;
  /** Limit per kind — defaults to 5 each. */
  limit?: number;
  /** Restrict to one kind. */
  kind?: LocalSearchKind;
  /** Optional bias towards a centre point (lat/lng) for distance ranking. */
  near?: { lat: number; lng: number };
  /** Optional hub filter (e.g., only show Cairo-area hits). */
  hub?: LocalSearchHub;
}

export interface LocalSearchResponse {
  query: string;
  /** Normalized form used internally (after diacritic strip + Latin↔Arabic transliteration). */
  normalized: string;
  hits: LocalSearchHit[];
  source: 'db' | 'catalog' | 'mixed';
  durationMs: number;
  // ---------------- additive (optional) fields ----------------
  /**
   * Up to 5 suggested alternate spellings when the query produced
   * zero or low-confidence hits. Each entry is a phrase the user
   * could click to retry. Always omitted when `hits` is satisfying.
   */
  suggestions?: string[];
  /**
   * Detected hub for the query, when the normalize layer found a
   * geographic anchor word ('cairo', 'giza', etc.).
   */
  detectedHub?: LocalSearchHub;
}
