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
 */
export type LocalSearchKind = 'station' | 'line' | 'stop' | 'landmark' | 'city';

export interface LocalSearchHit {
  /** Stable identifier per kind (DB id for stations/lines/stops, slug for landmarks/cities). */
  id: string;
  kind: LocalSearchKind;
  /** Best-effort localized display name (translated by the i18n interceptor downstream). */
  name: string;
  /** Aliases that matched the query (Arabic, English, franko/transliterated). */
  matchedAliases: string[];
  /** 0..1 — how confident we are in the match. */
  score: number;
  /** Optional latitude/longitude when the entity is geo-located. */
  lat?: number;
  lng?: number;
  /** Optional area / city / governorate label. */
  area?: string;
  /** When the hit is a station/line and the user can act on it. */
  href?: string;
}

export interface LocalSearchQuery {
  q: string;
  /** Limit per kind — defaults to 5 each. */
  limit?: number;
  /** Restrict to one kind. */
  kind?: LocalSearchKind;
  /** Optional bias towards a centre point (lat/lng) for distance ranking. */
  near?: { lat: number; lng: number };
}

export interface LocalSearchResponse {
  query: string;
  /** Normalized form used internally (after diacritic strip + Latin↔Arabic transliteration). */
  normalized: string;
  hits: LocalSearchHit[];
  source: 'db' | 'catalog' | 'mixed';
  durationMs: number;
}
