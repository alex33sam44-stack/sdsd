// Live operations data — lightweight aggregates for the operator dashboard.
// Fully self-hosted: reads the current backend via REST and derives UI metrics
// client-side. No secondary data path.

import { adminListAllStations } from "./stations";
import { listAdminLinesByStation } from "./lines";
import { listRecentSearches } from "@/lib/quickAccess";
import { coerceLineStatus } from "./enums";

export type LiveLine = {
  id: string;
  station_id: string;
  station_name?: string;
  destination: string;
  status: "active" | "crowded" | "stopped";
  cars: number;
  is_published: boolean;
  cars_updated_at: string;
  updated_at: string;
};

export type LiveStation = {
  id: string;
  name: string;
  area: string | null;
  is_published: boolean;
};

export type LiveOpsSnapshot = {
  fetchedAt: string;
  stations: LiveStation[];
  lines: LiveLine[];
};

export async function loadLiveOps(): Promise<LiveOpsSnapshot> {
  const stations = (await adminListAllStations()).map((s) => ({
    id: s.id,
    name: s.name,
    area: s.area ?? null,
    is_published: s.is_published,
  }));

  const byStation = await Promise.all(
    stations.map(async (station) => ({
      station,
      lines: await listAdminLinesByStation(station.id),
    })),
  );

  const lines: LiveLine[] = byStation.flatMap(({ station, lines }) =>
    lines.map((line) => ({
      id: line.id,
      station_id: station.id,
      station_name: station.name,
      destination: line.destination,
      status: coerceLineStatus(line.status) ?? "active",
      cars: Number(line.cars ?? 0),
      is_published: Boolean(line.is_published),
      cars_updated_at: line.cars_updated_at ?? line.updated_at ?? new Date().toISOString(),
      updated_at: line.updated_at ?? line.cars_updated_at ?? new Date().toISOString(),
    })),
  );

  return { fetchedAt: new Date().toISOString(), stations, lines };
}

export type SearchTrend = { query: string; count: number };

/** Aggregate recent client-side searches. Backend-level search trend endpoints
 * can replace this later without changing the dashboard UI contract. */
export async function loadTrendingSearches(limit = 200): Promise<SearchTrend[]> {
  const recents = listRecentSearches().slice(0, limit);
  const counts = new Map<string, number>();
  for (const entry of recents) {
    const query = (entry.query ?? "").trim().toLowerCase();
    if (!query) continue;
    counts.set(query, (counts.get(query) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([query, count]) => ({ query, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

// ----- Pure derivations (unit-testable) -----

export const STALE_AFTER_MIN = 60;

export function isStale(updatedAt: string, now = Date.now()): boolean {
  const t = new Date(updatedAt).getTime();
  if (!Number.isFinite(t)) return true;
  return (now - t) / 60000 > STALE_AFTER_MIN;
}

export type OpsMetrics = {
  totalStations: number;
  totalLines: number;
  activeLines: number;
  crowdedLines: number;
  stoppedLines: number;
  totalCars: number;
  staleLines: LiveLine[];
  zeroCarsLines: LiveLine[];
  stoppedLinesList: LiveLine[];
  unpublishedLines: LiveLine[];
};

export function deriveMetrics(snap: LiveOpsSnapshot, now = Date.now()): OpsMetrics {
  const publishedLines = snap.lines.filter((l) => l.is_published);
  const stale = publishedLines.filter((l) => isStale(l.cars_updated_at, now));
  const zero = publishedLines.filter((l) => l.status !== "stopped" && (l.cars ?? 0) === 0);
  const stopped = publishedLines.filter((l) => l.status === "stopped");
  const unpublished = snap.lines.filter((l) => !l.is_published);
  return {
    totalStations: snap.stations.filter((s) => s.is_published).length,
    totalLines: publishedLines.length,
    activeLines: publishedLines.filter((l) => l.status === "active").length,
    crowdedLines: publishedLines.filter((l) => l.status === "crowded").length,
    stoppedLines: stopped.length,
    totalCars: publishedLines.reduce((sum, l) => sum + (l.cars ?? 0), 0),
    staleLines: stale.slice(0, 8),
    zeroCarsLines: zero.slice(0, 8),
    stoppedLinesList: stopped.slice(0, 8),
    unpublishedLines: unpublished.slice(0, 8),
  };
}
