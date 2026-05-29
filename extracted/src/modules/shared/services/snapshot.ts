import { api } from "@/lib/api";
import { getLineOverrides } from "@/lib/storage";
import { logAudit } from "./audit";
import { adminGetStationWithLines, adminListAllStations } from "./stations";
import { listZones } from "./layout";
import { snakify } from "./_camelToSnake";
import {
  coerceLineStatus,
  isVehicleType,
  LINE_STATUSES,
  VEHICLE_TYPES,
  toBackendLineStatus,
  toBackendVehicleType,
} from "./enums";

const SCHEMA_VERSION = "phase2-v1";

export type Snapshot = {
  schema: typeof SCHEMA_VERSION;
  exportedAt: string;
  scope: { stationId?: string; stationName?: string };
  stations: any[];
  lines: any[];
  route_stops: any[];
  layout_zones: any[];
  station_layouts: any[];
};

export type ImportReportEntry = {
  level: "error" | "warning" | "info";
  message: string;
};

export type ImportPreview = {
  ok: boolean;
  schema: string | null;
  exportedAt: string | null;
  scope: Snapshot["scope"] | null;
  counts: Record<keyof PickTables, number>;
  errors: ImportReportEntry[];
  warnings: ImportReportEntry[];
  willOverwrite: { stations: number; lines: number; route_stops: number; layout_zones: number };
  willInsert: { stations: number; lines: number; route_stops: number; layout_zones: number };
};

type PickTables = Pick<
  Snapshot,
  "stations" | "lines" | "route_stops" | "layout_zones" | "station_layouts"
>;

const TABLES: (keyof PickTables)[] = [
  "stations",
  "station_layouts",
  "lines",
  "route_stops",
  "layout_zones",
];

function toCamelKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelifyRow<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue;
    out[toCamelKey(k)] = v;
  }
  return out;
}

async function fetchLayout(stationId: string) {
  try {
    const raw = await api.get<unknown>(`/layouts/${encodeURIComponent(stationId)}`);
    return raw ? snakify<any>(raw) : null;
  } catch (e: any) {
    if (e?.status === 404) return null;
    throw e;
  }
}

export async function exportSnapshot(stationId?: string): Promise<Snapshot> {
  const scopeId = stationId ?? undefined;
  const stations = await adminListAllStations();
  const selectedStations = scopeId ? stations.filter((s) => s.id === scopeId) : stations;

  const details = await Promise.all(
    selectedStations.map(async (station) => ({
      station,
      detail: await adminGetStationWithLines(station.id),
      zones: await listZones(station.id).catch(() => []),
      layout: await fetchLayout(station.id),
    })),
  );

  const snap: Snapshot = {
    schema: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    scope: {
      stationId: scopeId,
      stationName: scopeId ? selectedStations[0]?.name : undefined,
    },
    stations: selectedStations,
    lines: [],
    route_stops: [],
    layout_zones: [],
    station_layouts: [],
  };

  for (const item of details) {
    if (item.layout) snap.station_layouts.push(item.layout);
    snap.layout_zones.push(...item.zones);
    for (const line of item.detail?.lines ?? []) {
      snap.lines.push({ ...line, station_id: item.station.id });
      snap.route_stops.push(...(line.stops ?? []));
    }
  }

  return snap;
}

export function buildSnapshotFilename(snap: Snapshot): string {
  const date = (snap.exportedAt ?? new Date().toISOString()).slice(0, 10);
  const namePart = snap.scope?.stationName
    ? sanitizeForFilename(snap.scope.stationName)
    : "كل-المواقف";
  return `transport-${namePart}-${date}.json`;
}

function sanitizeForFilename(name: string): string {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 60) || "station";
}

function isValidLat(v: any): boolean {
  const n = Number(v);
  return Number.isFinite(n) && n >= -90 && n <= 90;
}
function isValidLng(v: any): boolean {
  const n = Number(v);
  return Number.isFinite(n) && n >= -180 && n <= 180;
}

function blankPreview(
  errors: ImportReportEntry[],
  warnings: ImportReportEntry[],
  counts: Record<keyof PickTables, number>,
): ImportPreview {
  return {
    ok: errors.length === 0,
    schema: null,
    exportedAt: null,
    scope: null,
    counts,
    errors,
    warnings,
    willOverwrite: { stations: 0, lines: 0, route_stops: 0, layout_zones: 0 },
    willInsert: { stations: 0, lines: 0, route_stops: 0, layout_zones: 0 },
  };
}

export async function previewSnapshot(raw: unknown): Promise<ImportPreview> {
  const errors: ImportReportEntry[] = [];
  const warnings: ImportReportEntry[] = [];
  const counts = {
    stations: 0,
    station_layouts: 0,
    lines: 0,
    route_stops: 0,
    layout_zones: 0,
  } as Record<keyof PickTables, number>;

  if (!raw || typeof raw !== "object") {
    errors.push({ level: "error", message: "الملف ليس كائن JSON صالح." });
    return blankPreview(errors, warnings, counts);
  }
  const snap = raw as Partial<Snapshot>;

  if (snap.schema !== SCHEMA_VERSION) {
    errors.push({
      level: "error",
      message: `إصدار الملف غير مدعوم (${snap.schema ?? "غير محدد"}). المتوقع: ${SCHEMA_VERSION}.`,
    });
  }

  for (const t of TABLES) {
    const arr = (snap as any)[t];
    if (arr === undefined) {
      warnings.push({ level: "warning", message: `جدول "${t}" غير موجود في الملف — سيتم تجاهله.` });
      continue;
    }
    if (!Array.isArray(arr)) {
      errors.push({ level: "error", message: `جدول "${t}" يجب أن يكون مصفوفة.` });
      continue;
    }
    counts[t] = arr.length;
  }

  function checkDuplicateIds(table: keyof PickTables, rows: any[]) {
    const seen = new Map<string, number>();
    for (const r of rows) {
      if (!r?.id) continue;
      seen.set(r.id, (seen.get(r.id) ?? 0) + 1);
    }
    for (const [id, count] of seen) {
      if (count > 1) {
        errors.push({
          level: "error",
          message: `معرّف مكرر داخل الملف نفسه في "${table}": ${id} (${count} مرات).`,
        });
      }
    }
  }

  for (const s of (snap.stations ?? []) as any[]) {
    if (!s?.id) errors.push({ level: "error", message: `موقف بدون معرّف: ${s?.name ?? "?"}` });
    if (!s?.name?.trim?.()) errors.push({ level: "error", message: `موقف بدون اسم (id=${s?.id}).` });
    if (s?.lat == null || s?.lng == null) {
      warnings.push({ level: "warning", message: `موقف بدون إحداثيات: ${s?.name ?? s?.id}` });
    } else if (!isValidLat(s.lat) || !isValidLng(s.lng)) {
      errors.push({
        level: "error",
        message: `موقف "${s?.name ?? s?.id}": إحداثيات خارج النطاق المسموح به.`,
      });
    }
  }
  checkDuplicateIds("stations", (snap.stations ?? []) as any[]);

  for (const l of (snap.lines ?? []) as any[]) {
    if (!l?.id) errors.push({ level: "error", message: "خط بدون معرّف." });
    if (!l?.station_id) errors.push({ level: "error", message: `خط بدون station_id (${l?.destination ?? l?.id}).` });
    if (!l?.destination?.trim?.()) {
      errors.push({ level: "error", message: `خط بدون وجهة (id=${l?.id}).` });
    }
    if (l?.status && !(LINE_STATUSES as readonly string[]).includes(l.status)) {
      warnings.push({
        level: "warning",
        message: `قيمة حالة غير قياسية ستُصحَّح تلقائياً: "${l.status}" → "${coerceLineStatus(l.status) ?? "active"}"`,
      });
    }
    if (l?.vehicle_type && !isVehicleType(l.vehicle_type)) {
      warnings.push({
        level: "warning",
        message: `نوع مركبة غير معروف "${l.vehicle_type}" سيُستبدل بـ "${VEHICLE_TYPES[0]}".`,
      });
    }
  }
  checkDuplicateIds("lines", (snap.lines ?? []) as any[]);

  const fileLineIds = new Set(((snap.lines ?? []) as any[]).map((l) => l.id));
  for (const st of (snap.route_stops ?? []) as any[]) {
    if (!st?.id) errors.push({ level: "error", message: "محطة بدون معرّف." });
    if (!st?.line_id || !fileLineIds.has(st.line_id)) {
      errors.push({ level: "error", message: `محطة مرتبطة بخط غير موجود في الملف (stop=${st?.id}).` });
    }
    if (!st?.name?.trim?.()) errors.push({ level: "error", message: `محطة بدون اسم (id=${st?.id}).` });
    if (!isValidLat(st?.lat) || !isValidLng(st?.lng)) {
      errors.push({ level: "error", message: `محطة بإحداثيات غير صالحة: ${st?.name ?? st?.id}` });
    }
  }
  checkDuplicateIds("route_stops", (snap.route_stops ?? []) as any[]);

  for (const z of (snap.layout_zones ?? []) as any[]) {
    if (!z?.id) errors.push({ level: "error", message: "رصيف بدون معرّف." });
    if (!z?.station_id) errors.push({ level: "error", message: `رصيف بدون station_id (id=${z?.id}).` });
    for (const k of ["x", "y", "w", "h"]) {
      const n = Number(z?.[k]);
      if (!Number.isFinite(n)) {
        errors.push({ level: "error", message: `قيمة غير رقمية في الرصيف ${z?.id}: ${k}.` });
      }
    }
  }
  checkDuplicateIds("layout_zones", (snap.layout_zones ?? []) as any[]);

  const current = await exportSnapshot(snap.scope?.stationId);
  const currentIds = {
    stations: new Set((current.stations ?? []).map((r: any) => r.id)),
    lines: new Set((current.lines ?? []).map((r: any) => r.id)),
    route_stops: new Set((current.route_stops ?? []).map((r: any) => r.id)),
    layout_zones: new Set((current.layout_zones ?? []).map((r: any) => r.id)),
  };

  const willOverwrite = {
    stations: ((snap.stations ?? []) as any[]).filter((r) => currentIds.stations.has(r.id)).length,
    lines: ((snap.lines ?? []) as any[]).filter((r) => currentIds.lines.has(r.id)).length,
    route_stops: ((snap.route_stops ?? []) as any[]).filter((r) => currentIds.route_stops.has(r.id)).length,
    layout_zones: ((snap.layout_zones ?? []) as any[]).filter((r) => currentIds.layout_zones.has(r.id)).length,
  };
  const willInsert = {
    stations: counts.stations - willOverwrite.stations,
    lines: counts.lines - willOverwrite.lines,
    route_stops: counts.route_stops - willOverwrite.route_stops,
    layout_zones: counts.layout_zones - willOverwrite.layout_zones,
  };

  return {
    ok: errors.length === 0,
    schema: (snap.schema as string) ?? null,
    exportedAt: snap.exportedAt ?? null,
    scope: snap.scope ?? null,
    counts,
    errors,
    warnings,
    willOverwrite,
    willInsert,
  };
}

export async function importSnapshot(
  snap: Snapshot,
  opts: { additive?: boolean } = {},
): Promise<{
  ok: true | false;
  error?: string;
  counts: Record<keyof PickTables, { inserted: number; overwritten: number; skipped: number }>;
  report: ImportReportEntry[];
}> {
  const preview = await previewSnapshot(snap);
  if (!preview.ok) {
    return {
      ok: false,
      error: preview.errors[0]?.message ?? "الملف غير صالح.",
      counts: emptyCounts(),
      report: [...preview.errors, ...preview.warnings],
    };
  }

  const additive = Boolean(opts.additive);
  const current = await exportSnapshot(snap.scope?.stationId);
  const existing = {
    stations: new Set((current.stations ?? []).map((r: any) => r.id)),
    lines: new Set((current.lines ?? []).map((r: any) => r.id)),
    route_stops: new Set((current.route_stops ?? []).map((r: any) => r.id)),
    layout_zones: new Set((current.layout_zones ?? []).map((r: any) => r.id)),
    station_layouts: new Set((current.station_layouts ?? []).map((r: any) => r.id)),
  };

  const counts = emptyCounts();
  const report: ImportReportEntry[] = [];

  try {
    for (const s of snap.stations ?? []) {
      if (existing.stations.has(s.id)) {
        if (additive) {
          counts.stations.skipped += 1;
          continue;
        }
        counts.stations.overwritten += 1;
        const patch = { ...s };
        delete patch.id;
        await api.patch(`/stations/${encodeURIComponent(s.id)}`, camelifyRow(patch));
      } else {
        counts.stations.inserted += 1;
        await api.post(`/stations`, camelifyRow(s));
      }
    }

    for (const layout of snap.station_layouts ?? []) {
      const stationId = layout.station_id;
      await api.put(`/layouts/${encodeURIComponent(stationId)}`, {
        viewbox: layout.viewbox,
        notes: layout.notes ?? null,
      });
      if (existing.station_layouts.has(layout.id)) counts.station_layouts.overwritten += 1;
      else counts.station_layouts.inserted += 1;
    }

    for (const line of snap.lines ?? []) {
      const normalized = {
        ...line,
        status: toBackendLineStatus(coerceLineStatus(line.status) ?? "active") ?? "active",
        vehicle_type: toBackendVehicleType(isVehicleType(line.vehicle_type) ? line.vehicle_type : VEHICLE_TYPES[0]) ?? "microbus",
      };
      if (existing.lines.has(line.id)) {
        if (additive) {
          counts.lines.skipped += 1;
          continue;
        }
        counts.lines.overwritten += 1;
        const patch = { ...normalized };
        delete patch.id;
        await api.patch(`/lines/${encodeURIComponent(line.id)}`, camelifyRow(patch));
      } else {
        counts.lines.inserted += 1;
        await api.post(`/lines`, camelifyRow(normalized));
      }
    }

    for (const stop of snap.route_stops ?? []) {
      if (existing.route_stops.has(stop.id)) {
        if (additive) {
          counts.route_stops.skipped += 1;
          continue;
        }
        counts.route_stops.overwritten += 1;
        const patch = { ...stop };
        delete patch.id;
        await api.patch(`/stops/${encodeURIComponent(stop.id)}`, camelifyRow(patch));
      } else {
        counts.route_stops.inserted += 1;
        await api.post(`/stops`, camelifyRow(stop));
      }
    }

    for (const zone of snap.layout_zones ?? []) {
      if (existing.layout_zones.has(zone.id)) {
        if (additive) {
          counts.layout_zones.skipped += 1;
          continue;
        }
        counts.layout_zones.overwritten += 1;
        const patch = { ...zone };
        delete patch.id;
        await api.patch(`/zones/${encodeURIComponent(zone.id)}`, camelifyRow(patch));
      } else {
        counts.layout_zones.inserted += 1;
        await api.post(`/zones`, camelifyRow(zone));
      }
    }

    await logAudit({
      entity: "snapshot",
      action: additive ? "import_additive" : "import_replace",
      diff: {
        stations: counts.stations,
        lines: counts.lines,
        route_stops: counts.route_stops,
        layout_zones: counts.layout_zones,
      } as any,
    });

    return { ok: true, counts, report };
  } catch (e: any) {
    report.push({ level: "error", message: e?.message ?? "تعذّر استيراد الملف." });
    return { ok: false, error: e?.message ?? "تعذّر الاستيراد", counts, report };
  }
}

function emptyCounts() {
  return {
    stations: { inserted: 0, overwritten: 0, skipped: 0 },
    station_layouts: { inserted: 0, overwritten: 0, skipped: 0 },
    lines: { inserted: 0, overwritten: 0, skipped: 0 },
    route_stops: { inserted: 0, overwritten: 0, skipped: 0 },
    layout_zones: { inserted: 0, overwritten: 0, skipped: 0 },
  };
}

/** Read legacy line-overrides from localStorage and mirror them into the
 * self-hosted backend as availability updates. */
export async function migrateLegacyOverrides(): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  try {
    const overrides = getLineOverrides();
    const entries = Object.entries(overrides);
    let updated = 0;
    for (const [lineId, value] of entries) {
      await api.post(`/lines/${encodeURIComponent(lineId)}/availability`, {
        cars: Math.max(0, Number(value?.cars ?? 0)),
        status: Number(value?.cars ?? 0) > 0 ? "active" : "closed",
      });
      updated += 1;
    }
    if (updated > 0) {
      await logAudit({ entity: "migration", action: "legacy_overrides_import", diff: { updated } as any });
    }
    return { ok: true, updated };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "تعذّر ترحيل التعديلات القديمة." };
  }
}
