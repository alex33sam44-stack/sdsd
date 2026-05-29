// Search service backed by REST `/search`. The backend returns matched
// stops with their parent line; we regroup by lineId into the LineWithStops
// shape consumers expect. `logSearch` is a no-op now (the backend logs the
// query during the GET); local recent-search history lives in `lib/quickAccess`.
import { api } from "@/lib/api";
import { snakify } from "./_camelToSnake";
import type { LineWithStops, RouteStop, SearchLog } from "../types";

type SearchHit = RouteStop & {
  line_id: string;
  line: (LineWithStops & { station?: unknown }) & { stops?: RouteStop[] };
};

/** Search published route stops by name or keyword; returns parent lines with their full stop list. */
export async function searchDestinations(query: string): Promise<LineWithStops[]> {
  const q = query.trim();
  if (!q) return [];
  const raw = await api.get<unknown[]>(`/search?q=${encodeURIComponent(q)}`);
  const hits = snakify<SearchHit[]>(raw);

  // Group hits by parent line id, keeping the line metadata from the first hit.
  const byLine = new Map<string, LineWithStops>();
  for (const hit of hits) {
    const lineId = hit.line_id;
    if (!byLine.has(lineId)) {
      const { stops: _drop, ...lineMeta } = hit.line ?? ({} as LineWithStops);
      byLine.set(lineId, { ...(lineMeta as LineWithStops), stops: [] });
    }
    // Also seed stops list from the line if it included them
    const entry = byLine.get(lineId)!;
    if (entry.stops.length === 0 && hit.line?.stops?.length) {
      entry.stops = [...hit.line.stops];
    }
  }
  // Sort each line's stops defensively.
  for (const line of byLine.values()) {
    line.stops = (line.stops ?? []).slice().sort((a, b) => a.position - b.position);
  }
  return Array.from(byLine.values()).filter((l) => l.is_published !== false);
}

/** No-op: backend `/search` records the query during the GET. Kept for API parity. */
export async function logSearch(_query: string, _resultCount: number): Promise<void> {
  /* recorded server-side */
}

/**
 * Recent searches are tracked client-side via `lib/quickAccess`. The backend
 * doesn't expose a per-user recent-search endpoint yet; return [] until it does.
 */
export async function listRecentSearches(_limit = 10): Promise<SearchLog[]> {
  return [];
}
