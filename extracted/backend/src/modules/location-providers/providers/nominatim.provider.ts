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
 * OpenStreetMap Nominatim adapter.
 *
 * Endpoint defaults to the public instance per OSM's usage policy
 * (max 1 req/s/IP, contact UA required). Operators running heavier
 * workloads should set `NOMINATIM_URL` to a self-hosted instance.
 *
 * No PII is forwarded; only the redacted query string + an optional
 * quantized "near" point are sent.
 */
export class NominatimProvider implements LocationProvider {
  readonly id = 'nominatim' as const;
  readonly capabilities: readonly ProviderCapability[] = ['search', 'reverse'];

  constructor(
    private readonly base = process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org',
    private readonly contactUa = process.env.LOCATION_PROVIDER_USER_AGENT ??
      'mwasalat-platform (https://mwasalat.app)',
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  isEnabled(): boolean {
    return true;
  }

  async probe(signal: AbortSignal): Promise<void> {
    const url = `${this.base.replace(/\/$/, '')}/status?format=json`;
    const res = await this.fetcher(url, { signal, headers: buildSafeHeaders(this.contactUa) });
    if (!res.ok) throw new Error(`nominatim status ${res.status}`);
  }

  async search(input: LocationSearchInput, signal: AbortSignal): Promise<LocationSearchHit[]> {
    const q = redactQuery(input.q);
    if (!q) return [];
    const params = new URLSearchParams({
      q,
      format: 'jsonv2',
      addressdetails: '1',
      limit: String(Math.min(50, Math.max(1, input.limit ?? 5))),
      countrycodes: input.country ?? 'eg',
    });
    if (input.near) {
      const n = quantize(input.near);
      // viewbox hint = ~50km box around the bias point
      const span = 0.5;
      params.set(
        'viewbox',
        `${n.lng - span},${n.lat + span},${n.lng + span},${n.lat - span}`,
      );
      params.set('bounded', '0');
    }
    if (input.locale) params.set('accept-language', input.locale);

    const res = await this.fetcher(`${this.base.replace(/\/$/, '')}/search?${params}`, {
      signal,
      headers: buildSafeHeaders(this.contactUa),
    });
    if (!res.ok) throw new Error(`nominatim search ${res.status}`);
    const body = (await res.json()) as Array<{
      place_id: string | number;
      display_name: string;
      lat: string;
      lon: string;
      importance?: number;
      address?: Record<string, string>;
    }>;
    return body.map((row) => ({
      id: `nominatim:${row.place_id}`,
      name: row.display_name,
      lat: Number(row.lat),
      lng: Number(row.lon),
      confidence: clamp01(typeof row.importance === 'number' ? row.importance : 0.4),
      rawScore: row.importance,
      provider: this.id,
      address: pickAddress(row.address),
    }));
  }

  async reverse(input: ReverseGeocodeInput, signal: AbortSignal): Promise<ReverseGeocodeHit | null> {
    const point = quantize(input);
    const params = new URLSearchParams({
      lat: String(point.lat),
      lon: String(point.lng),
      format: 'jsonv2',
      addressdetails: '1',
      zoom: String(Math.max(3, Math.min(18, input.zoom ?? 16))),
    });
    if (input.locale) params.set('accept-language', input.locale);
    const res = await this.fetcher(`${this.base.replace(/\/$/, '')}/reverse?${params}`, {
      signal,
      headers: buildSafeHeaders(this.contactUa),
    });
    if (!res.ok) throw new Error(`nominatim reverse ${res.status}`);
    const row = (await res.json()) as {
      place_id?: string | number;
      display_name?: string;
      lat?: string;
      lon?: string;
      address?: Record<string, string>;
    };
    if (!row || !row.display_name) return null;
    return {
      id: `nominatim:${row.place_id ?? `${row.lat},${row.lon}`}`,
      name: row.display_name,
      lat: Number(row.lat ?? input.lat),
      lng: Number(row.lon ?? input.lng),
      confidence: 0.7,
      provider: this.id,
      address: pickAddress(row.address),
    };
  }
}

function pickAddress(address?: Record<string, string>) {
  if (!address) return undefined;
  return {
    road: address.road,
    suburb: address.suburb ?? address.neighbourhood,
    city: address.city ?? address.town ?? address.village,
    state: address.state ?? address.region,
    country: address.country,
    postcode: address.postcode,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
