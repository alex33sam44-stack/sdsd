// Operational analytics — derived from the self-hosted backend plus local
// passenger quick-access history. No external analytics provider is required.

import { adminListAllStations, adminGetStationWithLines } from "./stations";
import { runValidation, type Issue } from "./validation";
import { listRecentSearches } from "@/lib/quickAccess";
import { coerceLineStatus } from "./enums";

export type LineRef = {
  line_id: string;
  station_id: string;
  station_name?: string;
  destination: string;
};

export type RequestedLine = LineRef & { requests: number };
export type UnservedQuery = { query: string; searches: number; avgResults: number };
export type LineAvailability = LineRef & {
  avgCars: number;
  samples: number;
  status: "active" | "crowded" | "stopped";
};
export type FreshnessBucket = { label: "fresh" | "recent" | "stale" | "very_stale"; count: number };
export type FreshnessMetrics = {
  totalPublished: number;
  freshPct: number;
  recentPct: number;
  stalePct: number;
  veryStalePct: number;
  buckets: FreshnessBucket[];
  medianAgeMin: number;
};
export type ProblemEntity = {
  kind: "station" | "line";
  id: string;
  stationId: string;
  label: string;
  errors: number;
  warnings: number;
  total: number;
};
export type DemandBucket = { hour: number; count: number };
export type DemandByDay = { day: string; count: number };

export type AnalyticsSnapshot = {
  fetchedAt: string;
  windowDays: number;
  topRequestedLines: RequestedLine[];
  unservedQueries: UnservedQuery[];
  lineAvailability: LineAvailability[];
  freshness: FreshnessMetrics;
  problemEntities: ProblemEntity[];
  demandByHour: DemandBucket[];
  demandByDay: DemandByDay[];
  totals: {
    searches: number;
    publishedLines: number;
    publishedStations: number;
    validationIssues: number;
  };
};

export function normalizeQuery(q: string): string {
  return (q ?? "")
    .toString()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[\u200B-\u200F]/g, "")
    .toLowerCase()
    .trim();
}

function ageMinutes(iso: string | null | undefined, now: number): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now - t) / 60000);
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export type AnalyticsInputs = {
  now: number;
  windowDays: number;
  stations: { id: string; name: string; is_published: boolean }[];
  lines: {
    id: string;
    station_id: string;
    destination: string;
    status: "active" | "crowded" | "stopped";
    cars: number | null;
    is_published: boolean;
    cars_updated_at: string | null;
  }[];
  routeStops: { line_id: string; name: string; keywords: string[] | null }[];
  searchLogs: { query: string; result_count: number | null; created_at: string }[];
  issues: Issue[];
};

export function deriveAnalytics(inp: AnalyticsInputs): Omit<AnalyticsSnapshot, "fetchedAt"> {
  const { now, windowDays, stations, lines, routeStops, searchLogs, issues } = inp;
  const stationById = new Map(stations.map((s) => [s.id, s]));
  const publishedLines = lines.filter((l) => l.is_published);
  const lineById = new Map(publishedLines.map((l) => [l.id, l]));

  const stopsByLine = new Map<string, { names: string[]; keywords: string[] }>();
  for (const rs of routeStops) {
    const cur = stopsByLine.get(rs.line_id) ?? { names: [], keywords: [] };
    cur.names.push(normalizeQuery(rs.name));
    for (const k of rs.keywords ?? []) cur.keywords.push(normalizeQuery(k));
    stopsByLine.set(rs.line_id, cur);
  }

  const lineHits = new Map<string, number>();
  const matchedQueries = new Set<string>();
  for (const log of searchLogs) {
    const nq = normalizeQuery(log.query);
    if (!nq) continue;
    let matched = false;
    for (const l of publishedLines) {
      const dest = normalizeQuery(l.destination);
      const sb = stopsByLine.get(l.id);
      const inDest = dest && (dest.includes(nq) || nq.includes(dest));
      const inStop = sb?.names.some((n) => n && (n.includes(nq) || nq.includes(n)));
      const inKw = sb?.keywords.some((k) => k && (k.includes(nq) || nq.includes(k)));
      if (inDest || inStop || inKw) {
        lineHits.set(l.id, (lineHits.get(l.id) ?? 0) + 1);
        matched = true;
      }
    }
    if (matched) matchedQueries.add(nq);
  }

  const topRequestedLines: RequestedLine[] = Array.from(lineHits.entries())
    .map(([line_id, requests]) => {
      const l = lineById.get(line_id)!;
      return {
        line_id,
        station_id: l.station_id,
        station_name: stationById.get(l.station_id)?.name,
        destination: l.destination,
        requests,
      };
    })
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 10);

  const unservedAgg = new Map<string, { count: number; sumResults: number }>();
  for (const log of searchLogs) {
    const nq = normalizeQuery(log.query);
    if (!nq) continue;
    const noResult = (log.result_count ?? 0) === 0 || !matchedQueries.has(nq);
    if (!noResult) continue;
    const cur = unservedAgg.get(nq) ?? { count: 0, sumResults: 0 };
    cur.count += 1;
    cur.sumResults += log.result_count ?? 0;
    unservedAgg.set(nq, cur);
  }
  const unservedQueries: UnservedQuery[] = Array.from(unservedAgg.entries())
    .map(([query, v]) => ({
      query,
      searches: v.count,
      avgResults: v.count ? v.sumResults / v.count : 0,
    }))
    .sort((a, b) => b.searches - a.searches)
    .slice(0, 10);

  const lineAvailability: LineAvailability[] = publishedLines
    .map((l) => ({
      line_id: l.id,
      station_id: l.station_id,
      station_name: stationById.get(l.station_id)?.name,
      destination: l.destination,
      avgCars: l.cars ?? 0,
      samples: 1,
      status: l.status,
    }))
    .sort((a, b) => b.avgCars - a.avgCars)
    .slice(0, 12);

  const ages = publishedLines.map((l) => ageMinutes(l.cars_updated_at, now));
  let fresh = 0, recent = 0, stale = 0, veryStale = 0;
  for (const a of ages) {
    if (a < 15) fresh++;
    else if (a < 60) recent++;
    else if (a < 180) stale++;
    else veryStale++;
  }
  const total = ages.length || 1;
  const freshness: FreshnessMetrics = {
    totalPublished: ages.length,
    freshPct: Math.round((fresh / total) * 100),
    recentPct: Math.round((recent / total) * 100),
    stalePct: Math.round((stale / total) * 100),
    veryStalePct: Math.round((veryStale / total) * 100),
    buckets: [
      { label: "fresh", count: fresh },
      { label: "recent", count: recent },
      { label: "stale", count: stale },
      { label: "very_stale", count: veryStale },
    ],
    medianAgeMin: Math.round(median(ages.filter((a) => Number.isFinite(a)))),
  };

  const counter = new Map<string, ProblemEntity>();
  const bump = (key: string, ent: ProblemEntity, level: Issue["level"]) => {
    const cur = counter.get(key) ?? ent;
    if (level === "error") cur.errors += 1;
    else if (level === "warning") cur.warnings += 1;
    cur.total = cur.errors + cur.warnings;
    counter.set(key, cur);
  };

  for (const i of issues) {
    if (i.lineId) {
      const l = lineById.get(i.lineId) ?? lines.find((line) => line.id === i.lineId);
      if (!l) continue;
      bump(
        `line:${i.lineId}`,
        {
          kind: "line",
          id: i.lineId,
          stationId: l.station_id,
          label: l.destination,
          errors: 0,
          warnings: 0,
          total: 0,
        },
        i.level,
      );
    } else if (i.stationId) {
      const s = stationById.get(i.stationId);
      bump(
        `station:${i.stationId}`,
        {
          kind: "station",
          id: i.stationId,
          stationId: i.stationId,
          label: s?.name ?? i.title,
          errors: 0,
          warnings: 0,
          total: 0,
        },
        i.level,
      );
    }
  }
  const problemEntities = Array.from(counter.values())
    .sort((a, b) => b.errors - a.errors || b.total - a.total)
    .slice(0, 10);

  const byHour = new Array(24).fill(0) as number[];
  const byDayMap = new Map<string, number>();
  for (const log of searchLogs) {
    const d = new Date(log.created_at);
    if (Number.isNaN(d.getTime())) continue;
    byHour[d.getHours()] += 1;
    const key = d.toISOString().slice(0, 10);
    byDayMap.set(key, (byDayMap.get(key) ?? 0) + 1);
  }
  const demandByHour: DemandBucket[] = byHour.map((count, hour) => ({ hour, count }));
  const demandByDay: DemandByDay[] = Array.from(byDayMap.entries())
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .slice(-windowDays);

  return {
    windowDays,
    topRequestedLines,
    unservedQueries,
    lineAvailability,
    freshness,
    problemEntities,
    demandByHour,
    demandByDay,
    totals: {
      searches: searchLogs.length,
      publishedLines: publishedLines.length,
      publishedStations: stations.filter((s) => s.is_published).length,
      validationIssues: issues.length,
    },
  };
}

export async function loadAnalytics(windowDays = 14): Promise<AnalyticsSnapshot> {
  const now = Date.now();
  const since = now - windowDays * 24 * 60 * 60 * 1000;

  const stations = await adminListAllStations();
  const bundles = await Promise.all(stations.map(async (station) => ({
    station,
    stationDetail: await adminGetStationWithLines(station.id),
  })));

  const lines: AnalyticsInputs["lines"] = [];
  const routeStops: AnalyticsInputs["routeStops"] = [];
  for (const bundle of bundles) {
    for (const line of bundle.stationDetail?.lines ?? []) {
      lines.push({
        id: line.id,
        station_id: bundle.station.id,
        destination: line.destination,
        status: coerceLineStatus(line.status) ?? "active",
        cars: line.cars ?? 0,
        is_published: line.is_published,
        cars_updated_at: line.cars_updated_at ?? null,
      });
      for (const stop of line.stops ?? []) {
        routeStops.push({
          line_id: line.id,
          name: stop.name,
          keywords: stop.keywords ?? [],
        });
      }
    }
  }

  const searchLogs = listRecentSearches()
    .filter((entry) => new Date(entry.usedAt).getTime() >= since)
    .map((entry) => ({ query: entry.query, result_count: 0, created_at: entry.usedAt }));

  const issues = await runValidation().catch(() => [] as Issue[]);

  return {
    fetchedAt: new Date().toISOString(),
    ...deriveAnalytics({
      now,
      windowDays,
      stations: stations.map((s) => ({ id: s.id, name: s.name, is_published: s.is_published })),
      lines,
      routeStops,
      searchLogs,
      issues,
    }),
  };
}
