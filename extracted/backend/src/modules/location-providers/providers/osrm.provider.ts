import { buildSafeHeaders } from '../privacy';
import type {
  LocationProvider,
  ProviderCapability,
  RouteEstimate,
  RouteEstimateInput,
} from '../types';

/**
 * OSRM (Open Source Routing Machine) adapter.
 *
 * Default endpoint is the public router.project-osrm.org (best
 * effort). Self-hosted operators should point `OSRM_URL` to their
 * own instance for production loads.
 *
 * Profile mapping:
 *   driving → "car"
 *   cycling → "bike"
 *   walking → "foot"
 */
export class OsrmProvider implements LocationProvider {
  readonly id = 'osrm' as const;
  readonly capabilities: readonly ProviderCapability[] = ['route'];

  constructor(
    private readonly base = process.env.OSRM_URL ?? 'https://router.project-osrm.org',
    private readonly contactUa = process.env.LOCATION_PROVIDER_USER_AGENT ??
      'mwasalat-platform (https://mwasalat.app)',
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  isEnabled(): boolean {
    return true;
  }

  async probe(signal: AbortSignal): Promise<void> {
    // OSRM has no /status; do a 1m round trip in Cairo.
    const url = `${this.base.replace(/\/$/, '')}/route/v1/car/31.2357,30.0444;31.2357,30.0445?overview=false`;
    const res = await this.fetcher(url, { signal, headers: buildSafeHeaders(this.contactUa) });
    if (!res.ok) throw new Error(`osrm probe ${res.status}`);
  }

  async route(input: RouteEstimateInput, signal: AbortSignal): Promise<RouteEstimate | null> {
    const profile = input.profile ?? 'driving';
    const osrmProfile = profile === 'driving' ? 'car' : profile === 'cycling' ? 'bike' : 'foot';
    const points = [input.from, ...(input.via ?? []).slice(0, 8), input.to]
      .map((p) => `${p.lng},${p.lat}`)
      .join(';');
    const url =
      `${this.base.replace(/\/$/, '')}/route/v1/${osrmProfile}/${points}` +
      `?overview=simplified&geometries=geojson&alternatives=false&steps=false`;
    const res = await this.fetcher(url, { signal, headers: buildSafeHeaders(this.contactUa) });
    if (!res.ok) throw new Error(`osrm route ${res.status}`);
    const body = (await res.json()) as {
      code?: string;
      routes?: Array<{
        distance?: number;
        duration?: number;
        geometry?: { coordinates?: Array<[number, number]> };
      }>;
    };
    if (body.code !== 'Ok') return null;
    const r = body.routes?.[0];
    if (!r) return null;
    const distanceKm = (r.distance ?? 0) / 1000;
    const durationMinutes = Math.max(1, Math.round((r.duration ?? 0) / 60));
    const coords = r.geometry?.coordinates ?? [];
    const polyline = downsamplePolyline(coords, 256);
    return {
      distanceKm: Math.round(distanceKm * 100) / 100,
      durationMinutes,
      polyline,
      profile,
      provider: this.id,
    };
  }
}

function downsamplePolyline(
  coords: Array<[number, number]>,
  cap: number,
): Array<[number, number]> {
  if (coords.length <= cap) return coords.map(([lng, lat]) => [lat, lng]);
  const step = Math.ceil(coords.length / cap);
  const out: Array<[number, number]> = [];
  for (let i = 0; i < coords.length; i += step) {
    const [lng, lat] = coords[i];
    out.push([lat, lng]);
  }
  const last = coords[coords.length - 1];
  if (last) out.push([last[1], last[0]]);
  return out;
}
