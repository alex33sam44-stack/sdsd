/**
 * Privacy guards for location queries.
 *
 * Location queries are particularly sensitive: they often reveal a
 * user's home, workplace, or current commute. Two rules:
 *
 * 1. NEVER forward identifying request metadata to a third-party
 *    provider. We strip any `x-forwarded-for`, `cookie`,
 *    `authorization`, and `user-agent` headers and replace UA with
 *    a fixed contact string per RFC of the provider in question
 *    (Nominatim's policy requires a contact email/UA).
 *
 * 2. Coordinates supplied for "near" biasing are quantized to
 *    ~110m precision (3 decimals) when forwarded externally, so an
 *    eavesdropper on the provider side cannot derive a unique
 *    daily commute pattern from the request stream.
 *
 * The Egypt-specific catalog (in local-search) is unaffected — it
 * runs entirely server-side with no outbound calls.
 */
import type { LocationPoint } from './types';

const MAX_QUERY_LEN = 200;
const QUERY_FORBIDDEN = /[<>{}\\^`]/g;

export function redactQuery(raw: string | null | undefined): string {
  if (!raw) return '';
  // strip control chars + provider-confusing punctuation
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(QUERY_FORBIDDEN, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LEN);
}

/**
 * Quantize a coordinate down to 3 decimal places (~110m at the
 * equator, ~96m at Cairo's latitude). Sufficient for ranking,
 * insufficient for surveillance.
 */
export function quantize(point: LocationPoint, decimals = 3): LocationPoint {
  const f = 10 ** decimals;
  return {
    lat: Math.round(point.lat * f) / f,
    lng: Math.round(point.lng * f) / f,
  };
}

/**
 * Build outbound headers safe to send to a third-party provider.
 *
 * `contactUa` should be a short identifier including a contact URL
 * or email per the Nominatim usage policy. The platform sets it
 * once via `LOCATION_PROVIDER_USER_AGENT`; the rest of the request
 * carries no PII.
 */
export function buildSafeHeaders(contactUa: string): Record<string, string> {
  return {
    'user-agent': contactUa,
    accept: 'application/json',
  };
}

/**
 * Validate input coordinates. Refuses NaN, infinity, and the
 * (0,0) point that often indicates a default/empty value bug.
 */
export function assertCoordinate(point: LocationPoint, field: string): void {
  if (!point) throw new Error(`${field}: missing`);
  const { lat, lng } = point;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(`${field}: lat/lng must be finite numbers`);
  }
  if (lat < -90 || lat > 90) throw new Error(`${field}.lat: out of range [-90, 90]`);
  if (lng < -180 || lng > 180) throw new Error(`${field}.lng: out of range [-180, 180]`);
  if (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6) {
    throw new Error(`${field}: (0,0) is treated as a missing value`);
  }
}

/**
 * Approximate Haversine distance for short distance sanity checks
 * (e.g., refusing route requests across continents).
 */
export function haversineKm(a: LocationPoint, b: LocationPoint): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
