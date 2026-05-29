// Operator suggestion engine.
//
// Distinct from the existing static validation tool: this runs over LIVE
// operational signals (cars freshness, search demand, layout↔line linkage,
// in-line stop name duplicates) and produces ranked, action-linked hints.
//
// Pure derivations: takes raw rows and returns Suggestion[]. Easy to test.

export type SuggestionSeverity = "high" | "medium" | "low";

export type SuggestionCategory =
  | "stale_line"          // not updated in X minutes
  | "orphan_zone"         // layout zone not bound to any line
  | "duplicate_stop"      // route has duplicate stop names
  | "demand_no_coverage"  // popular search but few/no published lines match
  | "stopped_published"   // line marked stopped but still published
  | "zero_cars_active";   // line is "active" but cars=0 for a while

export type Suggestion = {
  id: string;
  severity: SuggestionSeverity;
  category: SuggestionCategory;
  title: string;
  detail: string;
  actionTo: string;       // deep-link to the relevant admin/editor page
  actionLabel: string;
  signal: Record<string, string | number>; // raw signal values for transparency
};

// ---------- Inputs (shape mirrors what services already return) ----------

export type LineRow = {
  id: string;
  station_id: string;
  destination: string;
  status: "active" | "crowded" | "stopped";
  cars: number;
  is_published: boolean;
  cars_updated_at: string;
  pickup_area: string | null;
  zone_x: number | null;
  zone_y: number | null;
  zone_w: number | null;
  zone_h: number | null;
};

export type StopRow = {
  id: string;
  line_id: string;
  position: number;
  name: string;
};

export type ZoneRow = {
  id: string;
  station_id: string;
  zone_key: string;
  label: string | null;
};

export type SearchAggregate = { query: string; count: number };

// ---------- Thresholds (single source of truth) ----------

export const STALE_LINE_MIN = 90;             // > 1.5h old → high severity
export const STALE_LINE_WARN_MIN = 45;        // 45–90 min → medium severity
export const ZERO_CARS_GRACE_MIN = 30;        // active+0 cars longer than this
export const DEMAND_THRESHOLD = 3;            // # of recent searches to consider "popular"

// ---------- Engine ----------

export type EngineInputs = {
  lines: LineRow[];
  stops: StopRow[];
  zones: ZoneRow[];
  searches: SearchAggregate[];
  stationNameById?: Map<string, string>;
  now?: number;
};

export function buildSuggestions(input: EngineInputs): Suggestion[] {
  const now = input.now ?? Date.now();
  const sName = input.stationNameById ?? new Map<string, string>();
  const out: Suggestion[] = [];

  // 1) Stale lines (only published — operators don't care about drafts here)
  for (const l of input.lines) {
    if (!l.is_published) continue;
    const ageMin = ageMinutes(l.cars_updated_at, now);
    if (ageMin >= STALE_LINE_MIN) {
      out.push({
        id: `stale:${l.id}`,
        severity: "high",
        category: "stale_line",
        title: `لم يتم تحديث "${l.destination}" منذ ${ageMin} دقيقة`,
        detail: stationLabel(l, sName) + ` — آخر تحديث للعربيات قبل ${ageMin} دقيقة.`,
        actionTo: `/admin/line/${l.station_id}/${l.id}`,
        actionLabel: "افتح الخط للتحديث",
        signal: { ageMin, cars: l.cars, status: l.status },
      });
    } else if (ageMin >= STALE_LINE_WARN_MIN) {
      out.push({
        id: `stale:${l.id}`,
        severity: "medium",
        category: "stale_line",
        title: `"${l.destination}" يحتاج تحديثًا قريبًا`,
        detail: stationLabel(l, sName) + ` — آخر تحديث قبل ${ageMin} دقيقة.`,
        actionTo: `/admin/line/${l.station_id}/${l.id}`,
        actionLabel: "تحديث الآن",
        signal: { ageMin },
      });
    }
  }

  // 2) Active+published but cars=0 for a while → likely forgotten
  for (const l of input.lines) {
    if (!l.is_published) continue;
    if (l.status !== "active" && l.status !== "crowded") continue;
    if ((l.cars ?? 0) > 0) continue;
    const ageMin = ageMinutes(l.cars_updated_at, now);
    if (ageMin < ZERO_CARS_GRACE_MIN) continue;
    out.push({
      id: `zerocars:${l.id}`,
      severity: "medium",
      category: "zero_cars_active",
      title: `"${l.destination}" نشط لكن بدون عربيات`,
      detail: stationLabel(l, sName) + ` — العدد 0 منذ ${ageMin} دقيقة، إما حدّث العدد أو غيّر الحالة إلى "متوقف".`,
      actionTo: `/admin/line/${l.station_id}/${l.id}`,
      actionLabel: "ضبط الحالة أو العدد",
      signal: { ageMin, cars: 0 },
    });
  }

  // 3) Stopped but still published
  for (const l of input.lines) {
    if (l.status !== "stopped" || !l.is_published) continue;
    out.push({
      id: `stoppedpub:${l.id}`,
      severity: "high",
      category: "stopped_published",
      title: `"${l.destination}" متوقف لكنه ظاهر للركاب`,
      detail: stationLabel(l, sName) + " — الخط بحالة متوقف لكنه منشور.",
      actionTo: `/admin/line/${l.station_id}/${l.id}`,
      actionLabel: "إخفاء أو إعادة تشغيل",
      signal: { status: l.status, published: 1 },
    });
  }

  // 4) Layout zones not bound to any line in the same station
  // A line is considered "bound" to a zone either by exact pickup_area==zone.label
  // OR by having explicit zone_x/y/w/h set (handled separately).
  const linesByStation = groupBy(input.lines, (l) => l.station_id);
  for (const z of input.zones) {
    const stationLines = linesByStation.get(z.station_id) ?? [];
    const labelMatch = (z.label ?? z.zone_key).trim();
    if (!labelMatch) continue;
    const bound = stationLines.some(
      (l) => (l.pickup_area ?? "").trim() === labelMatch,
    );
    if (!bound) {
      out.push({
        id: `orphan_zone:${z.id}`,
        severity: "low",
        category: "orphan_zone",
        title: `الرصيف "${labelMatch}" غير مرتبط بأي خط`,
        detail: (sName.get(z.station_id) ?? "موقف") + " — لا يوجد خط يستخدم هذا الرصيف كنقطة ركوب.",
        actionTo: `/admin/layout/${z.station_id}`,
        actionLabel: "افتح تخطيط الموقف",
        signal: { stationId: z.station_id, zoneKey: z.zone_key },
      });
    }
  }

  // 5) Duplicate stop names within a single route (same line, normalised name)
  const stopsByLine = groupBy(input.stops, (s) => s.line_id);
  const lineById = new Map(input.lines.map((l) => [l.id, l]));
  for (const [lineId, stops] of stopsByLine) {
    const seen = new Map<string, number>();
    for (const s of stops) {
      const key = normalise(s.name);
      if (!key) continue;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const dups = Array.from(seen.entries()).filter(([, c]) => c > 1);
    if (dups.length === 0) continue;
    const l = lineById.get(lineId);
    if (!l) continue;
    out.push({
      id: `dupstop:${lineId}`,
      severity: "medium",
      category: "duplicate_stop",
      title: `أسماء محطات مكررة في "${l.destination}"`,
      detail: `تم اكتشاف ${dups.length} اسم متكرر — قد يربك البحث ويُسبّب نتائج مكررة.`,
      actionTo: `/admin/route/${l.station_id}/${l.id}`,
      actionLabel: "افتح المسار",
      signal: { duplicates: dups.length },
    });
  }

  // 6) Demand without coverage: popular searches whose token does not
  //    appear in any published line destination or stop name.
  const haystack = buildHaystack(input.lines, input.stops);
  for (const s of input.searches) {
    if (s.count < DEMAND_THRESHOLD) continue;
    const q = normalise(s.query);
    if (!q) continue;
    const hits = countMatches(haystack, q);
    if (hits === 0) {
      out.push({
        id: `demand:${q}`,
        severity: "high",
        category: "demand_no_coverage",
        title: `طلب مرتفع على "${s.query}" بدون تغطية`,
        detail: `تم البحث ${s.count} مرة ولا يوجد خط منشور يطابق هذا الاسم.`,
        actionTo: "/admin",
        actionLabel: "أنشئ خطًا أو محطة",
        signal: { query: s.query, searches: s.count, hits },
      });
    } else if (hits === 1 && s.count >= DEMAND_THRESHOLD * 2) {
      out.push({
        id: `demand:${q}`,
        severity: "medium",
        category: "demand_no_coverage",
        title: `طلب مرتفع على "${s.query}" والتغطية ضعيفة`,
        detail: `تم البحث ${s.count} مرة ولا يوجد سوى تطابق واحد فقط — فكّر في إضافة خط/محطة أخرى.`,
        actionTo: "/admin",
        actionLabel: "افتح لوحة الإدارة",
        signal: { query: s.query, searches: s.count, hits },
      });
    }
  }

  // Sort: severity (high → low), then category, then id for determinism.
  const sevRank: Record<SuggestionSeverity, number> = { high: 0, medium: 1, low: 2 };
  out.sort((a, b) =>
    sevRank[a.severity] - sevRank[b.severity] ||
    a.category.localeCompare(b.category) ||
    a.id.localeCompare(b.id),
  );
  return out;
}

// ---------- helpers ----------

function ageMinutes(iso: string, now: number): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.round((now - t) / 60000));
}

function stationLabel(l: LineRow, sName: Map<string, string>): string {
  const n = sName.get(l.station_id);
  return n ? n : "—";
}

function groupBy<T, K>(arr: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const it of arr) {
    const k = key(it);
    const list = m.get(k) ?? [];
    list.push(it);
    m.set(k, list);
  }
  return m;
}

function normalise(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")  // Arabic diacritics
    .replace(/\s+/g, " ")
    .trim();
}

function buildHaystack(lines: LineRow[], stops: StopRow[]): string[] {
  const out: string[] = [];
  for (const l of lines) if (l.is_published) out.push(normalise(l.destination));
  const publishedLineIds = new Set(lines.filter((l) => l.is_published).map((l) => l.id));
  for (const s of stops) if (publishedLineIds.has(s.line_id)) out.push(normalise(s.name));
  return out;
}

function countMatches(haystack: string[], needle: string): number {
  let n = 0;
  for (const h of haystack) if (h.includes(needle)) n++;
  return n;
}
