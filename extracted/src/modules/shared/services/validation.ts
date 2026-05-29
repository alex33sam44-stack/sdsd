// Cross-entity validation. Reads from the backend REST API (admin scope) and
// returns Arabic-friendly issues. Each issue carries a category for UI grouping
// and optional entity refs that drive quick-action edit links.
//
// Strategy:
//   - When a stationId is supplied, fetch only that station's lines/stops/zones.
//   - When unscoped, list all admin stations and iterate.
// Backend endpoints used: /stations/admin/all, /stations/admin/:id,
// /lines/admin?stationId, /zones?stationId.
import { api } from "@/lib/api";
import { snakify } from "./_camelToSnake";
import { adminListAllStations, adminGetStationWithLines } from "./stations";
import type { LayoutZone, Line, RouteStop, Station } from "../types";

export type IssueLevel = "error" | "warning" | "info";

export type IssueCategory =
  | "line_destination"
  | "line_pickup"
  | "line_status"
  | "line_published"
  | "line_visible_but_stopped"
  | "line_orphan_published"
  | "line_no_stops"
  | "line_cars_inconsistent"
  | "line_cars_negative"
  | "line_color_invalid"
  | "stop_coords"
  | "stop_keywords"
  | "stop_duplicate"
  | "stop_ordering"
  | "stop_orphan"
  | "station_coords"
  | "station_area"
  | "station_published"
  | "station_no_published_lines"
  | "zone_size"
  | "zone_position"
  | "zone_orphan";

export type IssueEntity = "station" | "line" | "route_stop" | "layout_zone";

export type Issue = {
  id: string;
  level: IssueLevel;
  category: IssueCategory;
  entity: IssueEntity;
  title: string;
  detail: string;
  stationId?: string;
  lineId?: string;
  stopId?: string;
  zoneId?: string;
};

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function hasValidCoords(lat: any, lng: any): boolean {
  const a = Number(lat);
  const b = Number(lng);
  if (lat == null || lng == null) return false;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (a === 0 && b === 0) return false;
  return true;
}

type LineFull = Line & { stops: RouteStop[] };

async function loadStationBundle(stationId: string): Promise<{
  station: Station | null;
  lines: LineFull[];
  zones: LayoutZone[];
}> {
  const [stationWithLines, zonesRaw] = await Promise.all([
    adminGetStationWithLines(stationId).catch(() => null),
    api.get<unknown[]>(`/zones?stationId=${encodeURIComponent(stationId)}`).catch(() => []),
  ]);
  return {
    station: stationWithLines as unknown as Station | null,
    lines: (stationWithLines?.lines ?? []) as LineFull[],
    zones: snakify<LayoutZone[]>(zonesRaw ?? []),
  };
}

export async function runValidation(stationId?: string): Promise<Issue[]> {
  const issues: Issue[] = [];

  // Collect (stations, lines, zones) using backend REST endpoints.
  let stations: Station[] = [];
  let lines: LineFull[] = [];
  let zones: LayoutZone[] = [];

  if (stationId) {
    const bundle = await loadStationBundle(stationId);
    if (bundle.station) stations = [bundle.station];
    lines = bundle.lines;
    zones = bundle.zones;
  } else {
    stations = await adminListAllStations();
    const bundles = await Promise.all(stations.map((s) => loadStationBundle(s.id)));
    for (const b of bundles) {
      lines.push(...b.lines);
      zones.push(...b.zones);
    }
  }

  const stationById = new Map<string, Station>();
  for (const s of stations) stationById.set(s.id, s);

  for (const s of stations) {
    if (!hasValidCoords(s.lat, s.lng)) {
      issues.push({
        id: `s-${s.id}-coords`, level: "error", category: "station_coords", entity: "station",
        title: `${s.name}: الموقف بدون إحداثيات`,
        detail: "أضف خط الطول والعرض حتى يظهر على الخريطة.",
        stationId: s.id,
      });
    }
    if (!s.is_published) {
      issues.push({
        id: `s-${s.id}-unpub`, level: "info", category: "station_published", entity: "station",
        title: `موقف غير منشور: ${s.name}`,
        detail: "هذا الموقف غير ظاهر للراكب.",
        stationId: s.id,
      });
    }
    if (!s.area?.trim()) {
      issues.push({
        id: `s-${s.id}-area`, level: "warning", category: "station_area", entity: "station",
        title: `${s.name}: وصف المنطقة فاضي`,
        detail: "أضف اسم المنطقة لتسهيل التعرف.",
        stationId: s.id,
      });
    }
  }

  const lineById = new Map<string, LineFull>();
  for (const l of lines) lineById.set(l.id, l);

  const publishedActiveLineCountByStation = new Map<string, number>();
  for (const l of lines) {
    if (l.is_published && l.status === "active") {
      publishedActiveLineCountByStation.set(
        l.station_id,
        (publishedActiveLineCountByStation.get(l.station_id) ?? 0) + 1,
      );
    }
  }

  for (const l of lines) {
    const label = (l.destination || "خط").toString();

    if (!l.destination?.trim()) {
      issues.push({
        id: `l-${l.id}-dest`, level: "error", category: "line_destination", entity: "line",
        title: "خط بدون وجهة",
        detail: "اكتب وجهة واضحة للخط.",
        stationId: l.station_id, lineId: l.id,
      });
    }
    if (!l.pickup_area?.trim()) {
      issues.push({
        id: `l-${l.id}-pickup`, level: "error", category: "line_pickup", entity: "line",
        title: `${label}: مكان الركوب فاضي`,
        detail: "أضف وصف مختصر يساعد الراكب يلاقي الرصيف.",
        stationId: l.station_id, lineId: l.id,
      });
    }
    if (l.color && !HEX_COLOR.test(String(l.color).trim())) {
      issues.push({
        id: `l-${l.id}-color`, level: "warning", category: "line_color_invalid", entity: "line",
        title: `${label}: لون الخط غير صالح`,
        detail: `القيمة "${l.color}" ليست لوناً سداسياً (#RRGGBB).`,
        stationId: l.station_id, lineId: l.id,
      });
    }
    if (typeof l.cars === "number" && l.cars < 0) {
      issues.push({
        id: `l-${l.id}-cars-neg`, level: "error", category: "line_cars_negative", entity: "line",
        title: `${label}: عدد عربيات سالب`,
        detail: `القيمة ${l.cars} غير صحيحة — صحّحها لصفر أو أكثر.`,
        stationId: l.station_id, lineId: l.id,
      });
    }
    if (l.status === "stopped") {
      if (l.is_published) {
        issues.push({
          id: `l-${l.id}-stopped-visible`, level: "error", category: "line_visible_but_stopped", entity: "line",
          title: `${label}: خط موقوف وظاهر للراكب`,
          detail: "الخط حالته «موقوف» لكنه منشور — أوقف النشر أو فعّل الخط.",
          stationId: l.station_id, lineId: l.id,
        });
      } else {
        issues.push({
          id: `l-${l.id}-stopped`, level: "warning", category: "line_status", entity: "line",
          title: `${label}: الخط موقوف`,
          detail: "الخط لن يخدم الركاب حتى يتم تفعيله.",
          stationId: l.station_id, lineId: l.id,
        });
      }
      if (typeof l.cars === "number" && l.cars > 0) {
        issues.push({
          id: `l-${l.id}-cars-vs-stopped`, level: "warning", category: "line_cars_inconsistent", entity: "line",
          title: `${label}: عربيات متاحة رغم إيقاف الخط`,
          detail: `الحالة «موقوف» لكن عدد العربيات ${l.cars}. وحّد القيم.`,
          stationId: l.station_id, lineId: l.id,
        });
      }
    } else if (l.status === "crowded") {
      issues.push({
        id: `l-${l.id}-crowded`, level: "info", category: "line_status", entity: "line",
        title: `${label}: زحمة`,
        detail: "الخط يعمل لكن الإقبال عالي.",
        stationId: l.station_id, lineId: l.id,
      });
    } else if (l.status !== "active") {
      issues.push({
        id: `l-${l.id}-status`, level: "error", category: "line_status", entity: "line",
        title: `${label}: حالة غير معروفة`,
        detail: `قيمة الحالة "${l.status}" غير مدعومة في قاعدة البيانات.`,
        stationId: l.station_id, lineId: l.id,
      });
    }

    if (l.is_published) {
      const station = stationById.get(l.station_id);
      if (!station) {
        issues.push({
          id: `l-${l.id}-orphan`, level: "error", category: "line_orphan_published", entity: "line",
          title: `${label}: خط منشور بدون موقف`,
          detail: "الخط مرتبط بمعرّف موقف غير موجود.",
          stationId: l.station_id, lineId: l.id,
        });
      } else if (!station.is_published) {
        issues.push({
          id: `l-${l.id}-orphan-unpub`, level: "error", category: "line_orphan_published", entity: "line",
          title: `${label}: خط منشور على موقف غير منشور`,
          detail: `الموقف "${station.name}" مش منشور — الخط لن يصل للراكب.`,
          stationId: l.station_id, lineId: l.id,
        });
      }
    }

    if (!l.is_published) {
      issues.push({
        id: `l-${l.id}-unpub`, level: "info", category: "line_published", entity: "line",
        title: `${label}: غير منشور`,
        detail: "الخط لن يظهر للراكب حتى يُنشر.",
        stationId: l.station_id, lineId: l.id,
      });
    }

    const stops = l.stops ?? [];
    if (stops.length === 0) {
      issues.push({
        id: `l-${l.id}-nostops`,
        level: l.is_published ? "error" : "warning",
        category: "line_no_stops", entity: "line",
        title: `${label}: الخط بدون محطات`,
        detail: l.is_published
          ? "الخط منشور لكن لا توجد محطات على المسار — أضف محطات أو أوقف النشر."
          : "أضف محطات على المسار قبل نشر الخط.",
        stationId: l.station_id, lineId: l.id,
      });
    }

    const seen = new Map<string, number>();
    const positions: number[] = [];
    for (const s of stops) {
      if (!hasValidCoords(s.lat, s.lng)) {
        issues.push({
          id: `st-${s.id}-coords`, level: "error", category: "stop_coords", entity: "route_stop",
          title: `${label}: محطة "${s.name}" بدون إحداثيات`,
          detail: "أضف خط الطول والعرض.",
          stationId: l.station_id, lineId: l.id, stopId: s.id,
        });
      }
      if (!Array.isArray(s.keywords) || s.keywords.length === 0) {
        issues.push({
          id: `st-${s.id}-kw`, level: "warning", category: "stop_keywords", entity: "route_stop",
          title: `${label}: محطة "${s.name}" بدون كلمات دلالية`,
          detail: "تساعد الكلمات الدلالية في البحث.",
          stationId: l.station_id, lineId: l.id, stopId: s.id,
        });
      }
      const k = (s.name ?? "").trim();
      if (k) seen.set(k, (seen.get(k) ?? 0) + 1);
      if (typeof s.position === "number") positions.push(s.position);
    }

    for (const [name, count] of seen) {
      if (count > 1) {
        issues.push({
          id: `l-${l.id}-dup-${name}`, level: "warning", category: "stop_duplicate", entity: "route_stop",
          title: `${label}: اسم محطة مكرر "${name}"`,
          detail: `مكرر ${count} مرات داخل نفس المسار.`,
          stationId: l.station_id, lineId: l.id,
        });
      }
    }

    if (positions.length > 0) {
      const sorted = [...positions].sort((a, b) => a - b);
      const hasDup = sorted.some((p, i) => i > 0 && p === sorted[i - 1]);
      const hasGap = sorted.some((p, i) => p !== i + 1);
      if (hasDup || hasGap) {
        issues.push({
          id: `l-${l.id}-order`, level: "error", category: "stop_ordering", entity: "line",
          title: `${label}: ترتيب المحطات غير صحيح`,
          detail: hasDup
            ? "يوجد محطات بنفس الرقم في الترتيب."
            : "أرقام الترتيب فيها فجوات أو لا تبدأ من 1.",
          stationId: l.station_id, lineId: l.id,
        });
      }
    }
  }

  // Stations published with no published+active lines.
  for (const s of stations) {
    if (!s.is_published) continue;
    const count = publishedActiveLineCountByStation.get(s.id) ?? 0;
    if (count === 0) {
      issues.push({
        id: `s-${s.id}-empty`, level: "info", category: "station_no_published_lines", entity: "station",
        title: `${s.name}: موقف منشور بدون خطوط فعالة`,
        detail: "الموقف ظاهر للراكب لكن لا يحتوي على خطوط منشورة فعّالة.",
        stationId: s.id,
      });
    }
  }

  // Layout zones.
  const linesByStation = new Map<string, LineFull[]>();
  for (const l of lines) {
    const arr = linesByStation.get(l.station_id) ?? [];
    arr.push(l);
    linesByStation.set(l.station_id, arr);
  }
  for (const z of zones) {
    const w = Number(z.w);
    const h = Number(z.h);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      issues.push({
        id: `z-${z.id}-size`, level: "error", category: "zone_size", entity: "layout_zone",
        title: `منطقة بدون أبعاد: ${z.label || z.zone_key}`,
        detail: "اضبط العرض والارتفاع من محرر التخطيط.",
        stationId: z.station_id, zoneId: z.id,
      });
    }
    const x = Number(z.x);
    const y = Number(z.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
      issues.push({
        id: `z-${z.id}-pos`, level: "warning", category: "zone_position", entity: "layout_zone",
        title: `منطقة في موضع غير صحيح: ${z.label || z.zone_key}`,
        detail: "الإحداثيات يجب ألا تكون سالبة.",
        stationId: z.station_id, zoneId: z.id,
      });
    }
    const stationLines = linesByStation.get(z.station_id) ?? [];
    const linked = stationLines.some(
      (l) => (l.destination ?? "").trim() === (z.label ?? "").trim()
    );
    if (!linked && stationLines.length) {
      issues.push({
        id: `z-${z.id}-orphan`, level: "warning", category: "zone_orphan", entity: "layout_zone",
        title: `منطقة غير مرتبطة بخط: ${z.label || z.zone_key}`,
        detail: "لا يوجد خط في نفس الموقف يحمل نفس الاسم.",
        stationId: z.station_id, zoneId: z.id,
      });
    }
  }

  return issues;
}

export const CATEGORY_AR: Record<IssueCategory, string> = {
  line_destination: "وجهات ناقصة",
  line_pickup: "وصف الركوب ناقص",
  line_status: "حالة الخط",
  line_published: "خطوط غير منشورة",
  line_visible_but_stopped: "خط موقوف لكنه ظاهر",
  line_orphan_published: "خط منشور بدون موقف صالح",
  line_no_stops: "خطوط بدون محطات",
  line_cars_inconsistent: "عربيات متعارضة مع الحالة",
  line_cars_negative: "عدد عربيات سالب",
  line_color_invalid: "لون خط غير صالح",
  stop_coords: "محطات بدون إحداثيات",
  stop_keywords: "محطات بدون كلمات دلالية",
  stop_duplicate: "أسماء محطات مكررة",
  stop_ordering: "ترتيب محطات غير صحيح",
  stop_orphan: "محطات يتيمة",
  station_coords: "مواقف بدون إحداثيات",
  station_area: "وصف منطقة الموقف ناقص",
  station_published: "مواقف غير منشورة",
  station_no_published_lines: "مواقف منشورة بدون خطوط فعّالة",
  zone_size: "مناطق بدون أبعاد",
  zone_position: "مناطق في موضع غير صحيح",
  zone_orphan: "مناطق غير مرتبطة بخط",
};
