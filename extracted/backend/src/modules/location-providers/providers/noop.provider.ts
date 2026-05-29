import { EGYPT_CATALOG } from '../../local-search/local-search.catalog';
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
import { haversineKm } from '../privacy';

/**
 * Deterministic offline fallback. Backed by the in-process Egypt
 * landmark + city catalogue so search/reverse always return at
 * least a coarse answer even without network access. Routing
 * answers a great-circle estimate.
 */
export class NoopProvider implements LocationProvider {
  readonly id = 'noop' as const;
  readonly capabilities: readonly ProviderCapability[] = ['search', 'reverse', 'route'];

  isEnabled(): boolean {
    return true;
  }

  async probe(): Promise<void> {
    // always healthy
  }

  async search(input: LocationSearchInput): Promise<LocationSearchHit[]> {
    const q = (input.q ?? '').trim().toLowerCase();
    if (!q) return [];
    const limit = Math.min(50, Math.max(1, input.limit ?? 5));
    const hits = EGYPT_CATALOG.flatMap((entry) => {
      const haystack = [entry.name, ...entry.aliases].map((s) => s.toLowerCase());
      const score = haystack.some((h) => h.includes(q) || q.includes(h)) ? 0.5 : 0;
      if (!score) return [];
      const distance =
        input.near != null
          ? haversineKm(input.near, { lat: entry.lat, lng: entry.lng })
          : null;
      const proximity = distance != null ? Math.max(0, 0.2 - distance * 0.01) : 0;
      const hit: LocationSearchHit = {
        id: entry.id,
        name: entry.name,
        lat: entry.lat,
        lng: entry.lng,
        confidence: Math.min(1, score + proximity),
        provider: this.id,
        address: entry.area ? { suburb: entry.area } : undefined,
      };
      return [hit];
    });
    hits.sort((a, b) => b.confidence - a.confidence);
    return hits.slice(0, limit);
  }

  async reverse(input: ReverseGeocodeInput): Promise<ReverseGeocodeHit | null> {
    let best: { entry: (typeof EGYPT_CATALOG)[number]; distance: number } | null = null;
    for (const entry of EGYPT_CATALOG) {
      const d = haversineKm({ lat: input.lat, lng: input.lng }, { lat: entry.lat, lng: entry.lng });
      if (!best || d < best.distance) best = { entry, distance: d };
    }
    if (!best) return null;
    return {
      id: best.entry.id,
      name: best.entry.name,
      lat: best.entry.lat,
      lng: best.entry.lng,
      confidence: Math.max(0, 1 - best.distance / 50),
      provider: this.id,
      address: best.entry.area ? { suburb: best.entry.area } : undefined,
    };
  }

  async route(input: RouteEstimateInput): Promise<RouteEstimate> {
    const profile = input.profile ?? 'driving';
    const distanceKm = haversineKm(input.from, input.to);
    // Conservative speed assumptions; tuned for Egyptian urban + intercity averages.
    const kmh = profile === 'walking' ? 4.5 : profile === 'cycling' ? 15 : 32;
    const durationMinutes = Math.max(1, Math.round((distanceKm / kmh) * 60));
    return {
      distanceKm: Math.round(distanceKm * 100) / 100,
      durationMinutes,
      polyline: this.straightLine(input.from, input.to, 24),
      profile,
      provider: this.id,
    };
  }

  private straightLine(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
    samples: number,
  ): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let i = 0; i <= samples; i += 1) {
      const t = i / samples;
      out.push([from.lat + (to.lat - from.lat) * t, from.lng + (to.lng - from.lng) * t]);
    }
    return out;
  }
}
