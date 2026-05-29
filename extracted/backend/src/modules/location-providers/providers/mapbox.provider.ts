import { buildSafeHeaders, quantize, redactQuery } from '../privacy';
import type {
  LocationProvider,
  LocationSearchHit,
  LocationSearchInput,
  ProviderCapability,
  ReverseGeocodeHit,
  ReverseGeocodeInput,
  RouteEstimate,
  RouteEstimateInput,
} from '../types';

/**
 * Mapbox adapter. Optional: only enabled when `MAPBOX_TOKEN` is
 * present. Used as a paid fallback when OSM-side providers are
 * rate-limited under high load.
 *
 * Costs: every search/reverse/route call is one billable transaction
 * on Mapbox's free tier — we keep it OFF the primary chain so it is
 * never the default cost driver.
 */
export class MapboxProvider implements LocationProvider {
  readonly id = 'mapbox' as const;
  readonly capabilities: readonly ProviderCapability[] = ['search', 'reverse', 'route'];

  constructor(
    private readonly token = process.env.MAPBOX_TOKEN ?? '',
    private readonly base = 'https://api.mapbox.com',
    private readonly contactUa = process.env.LOCATION_PROVIDER_USER_AGENT ??
      'mwasalat-platform (https://mwasalat.app)',
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  isEnabled(): boolean {
    return !!this.token;
  }

  async probe(signal: AbortSignal): Promise<void> {
    if (!this.token) throw new Error('mapbox disabled (no token)');
    const url = `${this.base}/geocoding/v5/mapbox.places/cairo.json?limit=1&access_token=${encodeURIComponent(this.token)}`;
    const res = await this.fetcher(url, { signal, headers: buildSafeHeaders(this.contactUa) });
    if (!res.ok) throw new Error(`mapbox probe ${res.status}`);
  }

  async search(input: LocationSearchInput, signal: AbortSignal): Promise<LocationSearchHit[]> {
    const q = redactQuery(input.q);
    if (!q || !this.token) return [];
    const params = new URLSearchParams({
      access_token: this.token,
      limit: String(Math.min(10, Math.max(1, input.limit ?? 5))),
      country: input.country ?? 'eg',
      autocomplete: 'true',
    });
    if (input.locale) params.set('language', input.locale.slice(0, 2));
    if (input.near) {
      const n = quantize(input.near);
      params.set('proximity', `${n.lng},${n.lat}`);
    }
    const url = `${this.base}/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?${params}`;
    const res = await this.fetcher(url, { signal, headers: buildSafeHeaders(this.contactUa) });
    if (!res.ok) throw new Error(`mapbox search ${res.status}`);
    const body = (await res.json()) as {
      features?: Array<{
        id?: string;
        place_name?: string;
        relevance?: number;
        center?: [number, number];
        context?: Array<{ id?: string; text?: string }>;
      }>;
    };
    return (body.features ?? []).flatMap((f) => {
      if (!f.center) return [];
      const ctx = (f.context ?? []).reduce<Record<string, string>>((acc, item) => {
        if (!item.id || !item.text) return acc;
        const key = item.id.split('.')[0];
        acc[key] = item.text;
        return acc;
      }, {});
      const hit: LocationSearchHit = {
        id: `mapbox:${f.id ?? f.place_name}`,
        name: f.place_name ?? '',
        lat: f.center[1],
        lng: f.center[0],
        confidence: typeof f.relevance === 'number' ? Math.max(0, Math.min(1, f.relevance)) : 0.6,
        rawScore: f.relevance,
        provider: this.id,
        address: {
          city: ctx.place,
          state: ctx.region,
          country: ctx.country,
          postcode: ctx.postcode,
        },
      };
      return [hit];
    });
  }

  async reverse(input: ReverseGeocodeInput, signal: AbortSignal): Promise<ReverseGeocodeHit | null> {
    if (!this.token) return null;
    const point = quantize(input);
    const params = new URLSearchParams({ access_token: this.token, limit: '1' });
    if (input.locale) params.set('language', input.locale.slice(0, 2));
    const url = `${this.base}/geocoding/v5/mapbox.places/${point.lng},${point.lat}.json?${params}`;
    const res = await this.fetcher(url, { signal, headers: buildSafeHeaders(this.contactUa) });
    if (!res.ok) throw new Error(`mapbox reverse ${res.status}`);
    const body = (await res.json()) as { features?: Array<any> };
    const f = body.features?.[0];
    if (!f || !f.center) return null;
    return {
      id: `mapbox:${f.id ?? f.place_name}`,
      name: f.place_name ?? '',
      lat: f.center[1],
      lng: f.center[0],
      confidence: 0.7,
      provider: this.id,
    };
  }

  async route(input: RouteEstimateInput, signal: AbortSignal): Promise<RouteEstimate | null> {
    if (!this.token) return null;
    const profile = input.profile ?? 'driving';
    const mapboxProfile =
      profile === 'driving' ? 'driving-traffic' : profile === 'cycling' ? 'cycling' : 'walking';
    const points = [input.from, ...(input.via ?? []).slice(0, 8), input.to]
      .map((p) => `${p.lng},${p.lat}`)
      .join(';');
    const params = new URLSearchParams({
      access_token: this.token,
      overview: 'simplified',
      geometries: 'geojson',
    });
    const url = `${this.base}/directions/v5/mapbox/${mapboxProfile}/${points}?${params}`;
    const res = await this.fetcher(url, { signal, headers: buildSafeHeaders(this.contactUa) });
    if (!res.ok) throw new Error(`mapbox route ${res.status}`);
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
    return {
      distanceKm: Math.round(((r.distance ?? 0) / 1000) * 100) / 100,
      durationMinutes: Math.max(1, Math.round((r.duration ?? 0) / 60)),
      polyline: (r.geometry?.coordinates ?? []).slice(0, 256).map(([lng, lat]) => [lat, lng]),
      profile,
      provider: this.id,
    };
  }
}
