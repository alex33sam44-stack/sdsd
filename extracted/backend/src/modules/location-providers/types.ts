/**
 * Location providers domain types.
 *
 * The platform consumes location data from a chain of pluggable
 * providers (OSM Nominatim, Komoot Photon, OSRM, Mapbox, …) so the
 * core search/route surface keeps working when any single provider
 * is rate-limited, slow, or down.
 *
 * The frozen frontend ships its own client-side search; this module
 * is additive — it powers /api/location/* endpoints used by the
 * planner and admin tooling without touching the existing
 * /api/local-search behaviour.
 *
 * Privacy: every input is run through `redactPii()` before any
 * outbound network call. We never forward a user IP, session
 * cookie, or auth header to a third-party provider.
 */

export type ProviderId = 'nominatim' | 'photon' | 'osrm' | 'mapbox' | 'noop';

export type ProviderCapability = 'search' | 'reverse' | 'route';

export type ProviderHealthState = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface LocationPoint {
  lat: number;
  lng: number;
}

export interface LocationSearchInput {
  q: string;
  /** Optional bias point (lat,lng) — providers will rank closer hits higher. */
  near?: LocationPoint;
  /** Restrict to a country code (ISO 3166-1 alpha-2). Default: 'eg'. */
  country?: string;
  /** Locale hint for the provider; mapped to provider-specific param. */
  locale?: string;
  /** 1..50 hits, default 5. */
  limit?: number;
}

export interface LocationSearchHit {
  /** Stable id within the provider (provider-specific format). */
  id: string;
  /** Display name (already localized by the provider when possible). */
  name: string;
  lat: number;
  lng: number;
  /** Optional structured address block. */
  address?: {
    road?: string;
    suburb?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
  /** 0..1 — provider-supplied or normalized confidence score. */
  confidence: number;
  /** Provider-supplied importance/score (untransformed) for debugging. */
  rawScore?: number;
  /** Which provider answered; useful for ops dashboards. */
  provider: ProviderId;
}

export interface ReverseGeocodeInput extends LocationPoint {
  locale?: string;
  /** OSM-style zoom 3..18 (city .. building). */
  zoom?: number;
}

export type ReverseGeocodeHit = LocationSearchHit;

export interface RouteEstimateInput {
  from: LocationPoint;
  to: LocationPoint;
  /** Routing profile; defaults to driving for microbus realism. */
  profile?: 'driving' | 'walking' | 'cycling';
  /** Optional waypoints. Length ≤ 8 to bound provider cost. */
  via?: LocationPoint[];
}

export interface RouteEstimate {
  /** Total kilometres along the suggested route. */
  distanceKm: number;
  /** Estimated duration in minutes. */
  durationMinutes: number;
  /** Coarse polyline as `[lat, lng][]`, capped at 256 points. */
  polyline: Array<[number, number]>;
  /** Echo of the routing profile used. */
  profile: 'driving' | 'walking' | 'cycling';
  provider: ProviderId;
}

export interface ProviderHealth {
  provider: ProviderId;
  state: ProviderHealthState;
  /** Latency of the last health check in ms (or null when never probed). */
  latencyMs: number | null;
  /** ISO timestamp of the last probe. */
  checkedAt: string;
  /** Optional human-readable status note (e.g. error message). */
  detail?: string;
  /** Capabilities the provider exposes. */
  capabilities: ProviderCapability[];
}

export interface LocationProvider {
  readonly id: ProviderId;
  readonly capabilities: readonly ProviderCapability[];
  /** True when this provider is configured and enabled (env vars present). */
  isEnabled(): boolean;
  search?(input: LocationSearchInput, signal: AbortSignal): Promise<LocationSearchHit[]>;
  reverse?(input: ReverseGeocodeInput, signal: AbortSignal): Promise<ReverseGeocodeHit | null>;
  route?(input: RouteEstimateInput, signal: AbortSignal): Promise<RouteEstimate | null>;
  /** Cheap probe used by the health daemon; should resolve in ≤2s. */
  probe(signal: AbortSignal): Promise<void>;
}

export interface OrchestratorOptions {
  /** Hard timeout per provider call (ms). */
  perProviderTimeoutMs: number;
  /** Maximum number of providers to attempt before giving up. */
  maxAttempts: number;
}

/** Errors thrown to translate into HTTP responses cleanly. */
export class ProviderUnavailableError extends Error {
  readonly tried: ProviderId[];
  constructor(tried: ProviderId[]) {
    super(`No location provider could satisfy the request (tried: ${tried.join(', ') || 'none'}).`);
    this.tried = tried;
  }
}

export class InvalidLocationInputError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.field = field;
  }
}
