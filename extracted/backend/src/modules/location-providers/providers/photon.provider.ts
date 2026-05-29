import { buildSafeHeaders, quantize, redactQuery } from '../privacy';
import type {
  LocationProvider,
  LocationSearchHit,
  LocationSearchInput,
  ProviderCapability,
  ReverseGeocodeHit,
  ReverseGeocodeInput,
} from '../types';

/**
 * Komoot Photon adapter. Lighter rate limits than Nominatim and a
 * permissive CORS policy, used as the first fallback when the
 * primary provider is throttled.
 */
export class PhotonProvider implements LocationProvider {
  readonly id = 'photon' as const;
  readonly capabilities: readonly ProviderCapability[] = ['search', 'reverse'];

  constructor(
    private readonly base = process.env.PHOTON_URL ?? 'https://photon.komoot.io',
    private readonly contactUa = process.env.LOCATION_PROVIDER_USER_AGENT ??
      'mwasalat-platform (https://mwasalat.app)',
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  isEnabled(): boolean {
    return true;
  }

  async probe(signal: AbortSignal): Promise<void> {
    const url = `${this.base.replace(/\/$/, '')}/api?q=cairo&limit=1`;
    const res = await this.fetcher(url, { signal, headers: buildSafeHeaders(this.contactUa) });
    if (!res.ok) throw new Error(`photon status ${res.status}`);
  }

  async search(input: LocationSearchInput, signal: AbortSignal): Promise<LocationSearchHit[]> {
    const q = redactQuery(input.q);
    if (!q) return [];
    const params = new URLSearchParams({
      q,
      limit: String(Math.min(50, Math.max(1, input.limit ?? 5))),
    });
    if (input.locale) params.set('lang', input.locale.slice(0, 2));
    if (input.near) {
      const n = quantize(input.near);
      params.set('lat', String(n.lat));
      params.set('lon', String(n.lng));
    }
    const res = await this.fetcher(`${this.base.replace(/\/$/, '')}/api?${params}`, {
      signal,
      headers: buildSafeHeaders(this.contactUa),
    });
    if (!res.ok) throw new Error(`photon search ${res.status}`);
    const body = (await res.json()) as {
      features?: Array<{
        properties?: {
          osm_id?: number;
          name?: string;
          city?: string;
          state?: string;
          country?: string;
          postcode?: string;
          street?: string;
          countrycode?: string;
        };
        geometry?: { coordinates?: [number, number] };
      }>;
    };
    const features = body.features ?? [];
    const hits: LocationSearchHit[] = [];
    for (const f of features) {
      const coords = f.geometry?.coordinates;
      if (!coords) continue;
      const cc = f.properties?.countrycode?.toLowerCase();
      if (input.country && cc && cc !== input.country.toLowerCase()) continue;
      const props = f.properties ?? {};
      hits.push({
        id: `photon:${props.osm_id ?? `${coords[1]},${coords[0]}`}`,
        name: [props.name, props.city ?? props.state, props.country].filter(Boolean).join(', '),
        lat: coords[1],
        lng: coords[0],
        confidence: 0.55,
        provider: this.id,
        address: {
          road: props.street,
          city: props.city,
          state: props.state,
          country: props.country,
          postcode: props.postcode,
        },
      });
    }
    return hits;
  }

  async reverse(input: ReverseGeocodeInput, signal: AbortSignal): Promise<ReverseGeocodeHit | null> {
    const point = quantize(input);
    const params = new URLSearchParams({
      lat: String(point.lat),
      lon: String(point.lng),
      limit: '1',
    });
    if (input.locale) params.set('lang', input.locale.slice(0, 2));
    const res = await this.fetcher(`${this.base.replace(/\/$/, '')}/reverse?${params}`, {
      signal,
      headers: buildSafeHeaders(this.contactUa),
    });
    if (!res.ok) throw new Error(`photon reverse ${res.status}`);
    const body = (await res.json()) as {
      features?: Array<{
        properties?: any;
        geometry?: { coordinates?: [number, number] };
      }>;
    };
    const f = body.features?.[0];
    if (!f || !f.geometry?.coordinates) return null;
    const props = f.properties ?? {};
    return {
      id: `photon:${props.osm_id ?? `${input.lat},${input.lng}`}`,
      name: [props.name, props.city ?? props.state, props.country].filter(Boolean).join(', '),
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      confidence: 0.65,
      provider: this.id,
      address: {
        road: props.street,
        city: props.city,
        state: props.state,
        country: props.country,
        postcode: props.postcode,
      },
    };
  }
}
