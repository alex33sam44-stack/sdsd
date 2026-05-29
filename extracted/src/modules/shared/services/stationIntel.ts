// ---------------------------------------------------------------------------
// Operator overlays read these metrics; nothing here mutates state.
//
// Scope of v1 (implemented):
//   - Bay utilization per pickup_area / layout_zone:
//       * lines_in_bay, total_cars, active_lines, stale_lines
//       * status: "crowded" | "active" | "idle" | "inactive" | "unassigned"
//   - Station congestion index (0..100): blend of car density, crowded-line
//     ratio, and update freshness.
//   - Station complexity score (0..100): rough proxy for internal walking
//     friction — function of #lines, #bays, and zone spread on the SVG.
//   - Reassignment hints (placeholder, see PLACEHOLDERS below): zero-car
//     bays adjacent to over-crowded bays are flagged for operator review.
//
// PLACEHOLDERS (reserved for later, return empty/neutral values today):
//   - per-hour bay utilization curves (needs availability_logs aggregation)
//   - true walking-time matrix between bays (needs zone graph + speed model)
//   - cross-bay transfer demand (needs trip plans logged with origin bay)
// ---------------------------------------------------------------------------

export type IntelLine = {
  id: string;
  destination: string;
  pickup_area: string | null;
  status: "active" | "crowded" | "stopped";
  cars: number | null;
  cars_updated_at: string | null;
  zone_x?: number | null;
  zone_y?: number | null;
  zone_w?: number | null;
  zone_h?: number | null;
  is_published: boolean;
};

export type IntelZone = {
  id: string;
  zone_key: string;
  label: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type BayStatus = "crowded" | "active" | "idle" | "inactive" | "unassigned";

export type BayMetrics = {
  /** Stable identifier: pickup_area string, or zone_key, or "__unassigned__". */
  bayKey: string;
  label: string;
  linesCount: number;
  totalCars: number;
  activeLines: number;
  crowdedLines: number;
  stoppedLines: number;
  staleLines: number;
  /** Median minutes since last update (Infinity if all unknown). */
  medianAgeMin: number;
  status: BayStatus;
  /** 0..100 — share of station-wide load this bay carries. */
  loadPct: number;
  /** Reference line ids (for deep-linking from the UI). */
  lineIds: string[];
  /** Reference zone id (when matched to layout_zones). */
  zoneId?: string;
};

export type CongestionLevel = "calm" | "busy" | "saturated";
export type ComplexityLevel = "simple" | "moderate" | "complex";

export type ReassignmentHint = {
  /** Source bay (over-loaded). */
  fromBayKey: string;
  /** Suggested target bay (under-utilized). */
  toBayKey: string;
  reason: string; // Arabic-ready short text key (i18n resolved in UI)
  reasonKey: "bay.reassign.idleAdjacent" | "bay.reassign.zeroCars";
};

export type StationIntel = {
  bays: BayMetrics[];
  congestionScore: number;        // 0..100
  congestionLevel: CongestionLevel;
  complexityScore: number;        // 0..100
  complexityLevel: ComplexityLevel;
  reassignmentHints: ReassignmentHint[];
  totals: {
    publishedLines: number;
    activeBays: number;
    totalCars: number;
    staleLines: number;
  };
};

// ---- helpers ---------------------------------------------------------------

const STALE_AFTER_MIN = 60;

function ageMin(iso: string | null | undefined, now: number): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now - t) / 60_000);
}

function median(nums: number[]): number {
  const finite = nums.filter((n) => Number.isFinite(n));
  if (!finite.length) return Number.POSITIVE_INFINITY;
  const s = [...finite].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Rectangle center on the SVG viewbox (0..100). */
function center(l: { zone_x?: number | null; zone_y?: number | null; zone_w?: number | null; zone_h?: number | null }): [number, number] | null {
  const x = Number(l.zone_x), y = Number(l.zone_y), w = Number(l.zone_w), h = Number(l.zone_h);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  return [x + w / 2, y + h / 2];
}

function dist2(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0], dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

// ---- bay status derivation -------------------------------------------------

export function deriveBayStatus(b: Pick<BayMetrics, "linesCount" | "activeLines" | "crowdedLines" | "stoppedLines" | "totalCars" | "staleLines">): BayStatus {
  if (b.linesCount === 0) return "unassigned";
  // Crowded if >50% of lines crowded, or saturated cars relative to capacity-ish heuristic.
  if (b.crowdedLines >= Math.max(1, Math.ceil(b.linesCount * 0.5))) return "crowded";
  if (b.activeLines === 0) return "inactive";
  if (b.totalCars === 0 || b.staleLines === b.linesCount) return "idle";
  return "active";
}

// ---- main ------------------------------------------------------------------

export function computeStationIntel(
  lines: IntelLine[],
  zones: IntelZone[],
  now: number = Date.now(),
): StationIntel {
  const published = lines.filter((l) => l.is_published);

  // Group lines by bay key. Prefer pickup_area; fall back to "__unassigned__".
  const byBay = new Map<string, IntelLine[]>();
  for (const l of published) {
    const key = (l.pickup_area ?? "").trim() || "__unassigned__";
    if (!byBay.has(key)) byBay.set(key, []);
    byBay.get(key)!.push(l);
  }
  // Add zones with no matching line as empty bays.
  const zoneByKey = new Map<string, IntelZone>();
  for (const z of zones) zoneByKey.set(z.zone_key, z);
  for (const z of zones) {
    if (!byBay.has(z.zone_key)) byBay.set(z.zone_key, []);
  }

  const totalCarsAll = published.reduce((s, l) => s + (l.cars ?? 0), 0) || 1;

  const bays: BayMetrics[] = [];
  for (const [key, ls] of byBay.entries()) {
    const z = zoneByKey.get(key);
    const totalCars = ls.reduce((s, l) => s + (l.cars ?? 0), 0);
    const ages = ls.map((l) => ageMin(l.cars_updated_at, now));
    const stale = ls.filter((l) => ageMin(l.cars_updated_at, now) > STALE_AFTER_MIN).length;
    const active = ls.filter((l) => l.status === "active").length;
    const crowded = ls.filter((l) => l.status === "crowded").length;
    const stopped = ls.filter((l) => l.status === "stopped").length;
    const baseStatus = deriveBayStatus({
      linesCount: ls.length, activeLines: active, crowdedLines: crowded,
      stoppedLines: stopped, totalCars, staleLines: stale,
    });
    bays.push({
      bayKey: key,
      label: z?.label ?? (key === "__unassigned__" ? "غير معيّن" : key),
      linesCount: ls.length,
      totalCars,
      activeLines: active,
      crowdedLines: crowded,
      stoppedLines: stopped,
      staleLines: stale,
      medianAgeMin: median(ages),
      status: baseStatus,
      loadPct: Math.round((totalCars / totalCarsAll) * 100),
      lineIds: ls.map((l) => l.id),
      zoneId: z?.id,
    });
  }

  bays.sort((a, b) => b.totalCars - a.totalCars || b.linesCount - a.linesCount);

  // ---- Congestion score (0..100) ----
  // 50% car density signal, 30% crowded-line ratio, 20% staleness penalty.
  const carsPerActiveBay = bays.length
    ? totalCarsAll / Math.max(1, bays.filter((b) => b.linesCount > 0).length)
    : 0;
  const carDensity = Math.min(100, carsPerActiveBay * 8); // 12.5 cars/bay → 100
  const crowdedRatio = published.length
    ? (bays.reduce((s, b) => s + b.crowdedLines, 0) / published.length) * 100
    : 0;
  const staleRatio = published.length
    ? (bays.reduce((s, b) => s + b.staleLines, 0) / published.length) * 100
    : 0;
  const congestionScore = Math.round(
    carDensity * 0.5 + crowdedRatio * 0.3 + staleRatio * 0.2,
  );
  const congestionLevel: CongestionLevel =
    congestionScore >= 60 ? "saturated" : congestionScore >= 30 ? "busy" : "calm";

  // ---- Complexity score (0..100) ----
  // Lines + bays count + spatial spread of zones (proxy for walking friction).
  const lineCountPts = Math.min(40, published.length * 4); // 10+ lines = 40
  const bayCountPts = Math.min(30, bays.filter((b) => b.linesCount > 0).length * 5); // 6+ bays = 30
  let spreadPts = 0;
  const centers = published.map(center).filter((c): c is [number, number] => !!c);
  if (centers.length >= 2) {
    let maxD = 0;
    for (let i = 0; i < centers.length; i++) {
      for (let j = i + 1; j < centers.length; j++) {
        const d = Math.sqrt(dist2(centers[i], centers[j]));
        if (d > maxD) maxD = d;
      }
    }
    // viewbox is 0..100 → diagonal ≈141. Map maxD → 0..30.
    spreadPts = Math.min(30, (maxD / 141) * 30);
  }
  const complexityScore = Math.round(lineCountPts + bayCountPts + spreadPts);
  const complexityLevel: ComplexityLevel =
    complexityScore >= 70 ? "complex" : complexityScore >= 40 ? "moderate" : "simple";

  // ---- Reassignment hints (v1: simple adjacency rule) ----
  const hints: ReassignmentHint[] = [];
  const crowdedBays = bays.filter((b) => b.status === "crowded");
  const idleBays = bays.filter((b) => b.status === "idle" || b.status === "inactive" || (b.status === "unassigned" && b.zoneId));
  for (const c of crowdedBays) {
    // find nearest idle bay by zone center distance, if both have zones
    const cZone = c.zoneId ? zones.find((z) => z.id === c.zoneId) : null;
    if (!cZone) continue;
    const cCenter: [number, number] = [cZone.x + cZone.w / 2, cZone.y + cZone.h / 2];
    let best: { bay: BayMetrics; d: number } | null = null;
    for (const i of idleBays) {
      const iZone = i.zoneId ? zones.find((z) => z.id === i.zoneId) : null;
      if (!iZone) continue;
      const iCenter: [number, number] = [iZone.x + iZone.w / 2, iZone.y + iZone.h / 2];
      const d = Math.sqrt(dist2(cCenter, iCenter));
      if (!best || d < best.d) best = { bay: i, d };
    }
    if (best && best.d <= 35) {
      hints.push({
        fromBayKey: c.bayKey,
        toBayKey: best.bay.bayKey,
        reason: "Adjacent bay is idle — consider redistributing.",
        reasonKey: "bay.reassign.idleAdjacent",
      });
    }
  }
  // Plus a global hint: zero-car active line near unassigned zone.
  for (const b of bays) {
    if (b.linesCount > 0 && b.totalCars === 0 && b.activeLines > 0) {
      hints.push({
        fromBayKey: b.bayKey,
        toBayKey: b.bayKey,
        reason: "Active bay has no available cars right now.",
        reasonKey: "bay.reassign.zeroCars",
      });
    }
  }

  return {
    bays,
    congestionScore,
    congestionLevel,
    complexityScore,
    complexityLevel,
    reassignmentHints: hints.slice(0, 6),
    totals: {
      publishedLines: published.length,
      activeBays: bays.filter((b) => b.linesCount > 0).length,
      totalCars: totalCarsAll === 1 && published.length === 0 ? 0 : totalCarsAll,
      staleLines: bays.reduce((s, b) => s + b.staleLines, 0),
    },
  };
}

// ---- placeholders (reserved for later) -------------------------------------

/** Hourly utilization curve per bay — needs availability_logs aggregation.
 *  Returns empty array today; UI must handle gracefully. */
export function bayUtilizationCurve(_bayKey: string): { hour: number; cars: number }[] {
  return [];
}

/** True walking-time matrix between bays — needs station graph + speed model.
 *  Returns null today. */
export function bayWalkingMatrix(): null {
  return null;
}
