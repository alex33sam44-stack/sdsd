// Safe migration utility: legacy local seed (`src/data/stations.ts`) → the
// self-hosted backend via the snapshot/import pipeline.
//
// Design goals:
//   • Dev-only.
//   • Idempotent enough for repeated dry-runs.
//   • Reuses the runtime import/export logic instead of maintaining a second
//     write path.

import { STATIONS as SEED } from "@/data/stations";
import { isDevMode } from "@/lib/dataMode";
import {
  coerceLineStatus,
  isVehicleType,
  VEHICLE_TYPES,
} from "./enums";
import {
  importSnapshot,
  previewSnapshot,
  type Snapshot,
} from "./snapshot";

const NAMESPACE = "8e1f2c2a-71a3-4f08-9c5d-2b3e4f5a6b7c";

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
function bytesToUuid(b: Uint8Array): string {
  const h = Array.from(b.slice(0, 16))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

async function uuidv5(name: string, namespace = NAMESPACE): Promise<string> {
  const ns = hexToBytes(namespace.replace(/-/g, ""));
  const enc = new TextEncoder().encode(name);
  const buf = new Uint8Array(ns.length + enc.length);
  buf.set(ns, 0);
  buf.set(enc, ns.length);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", buf));
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  return bytesToUuid(digest);
}

export type MigrationEntryStatus = "imported" | "skipped" | "transformed" | "error";
export type MigrationEntry = {
  table: "stations" | "lines" | "route_stops";
  status: MigrationEntryStatus;
  legacyId: string;
  newId?: string;
  message: string;
};

export type MigrationReport = {
  ok: boolean;
  dryRun: boolean;
  totals: {
    stationsPlanned: number;
    linesPlanned: number;
    stopsPlanned: number;
    imported: number;
    skipped: number;
    transformed: number;
    errors: number;
  };
  entries: MigrationEntry[];
};

function emptyReport(dryRun: boolean): MigrationReport {
  return {
    ok: true,
    dryRun,
    totals: {
      stationsPlanned: 0,
      linesPlanned: 0,
      stopsPlanned: 0,
      imported: 0,
      skipped: 0,
      transformed: 0,
      errors: 0,
    },
    entries: [],
  };
}

function record(report: MigrationReport, entry: MigrationEntry) {
  report.entries.push(entry);
  if (entry.status === "imported") report.totals.imported += 1;
  else if (entry.status === "skipped") report.totals.skipped += 1;
  else if (entry.status === "transformed") report.totals.transformed += 1;
  else if (entry.status === "error") {
    report.totals.errors += 1;
    report.ok = false;
  }
}

type Plan = {
  snapshot: Snapshot;
  transformations: MigrationEntry[];
};

async function buildPlan(): Promise<Plan> {
  const transformations: MigrationEntry[] = [];
  const stations: Snapshot["stations"] = [];
  const lines: Snapshot["lines"] = [];
  const routeStops: Snapshot["route_stops"] = [];
  const stationLayouts: Snapshot["station_layouts"] = [];
  const layoutZones: Snapshot["layout_zones"] = [];

  for (const station of SEED) {
    const stationUuid = await uuidv5(`station:${station.id}`);
    stations.push({
      id: stationUuid,
      name: station.name,
      area: station.area ?? null,
      lat: station.lat,
      lng: station.lng,
      city_id: null,
      is_published: true,
    });

    stationLayouts.push({
      id: await uuidv5(`layout:${station.id}`),
      station_id: stationUuid,
      viewbox: "0 0 100 100",
      notes: null,
    });

    for (const line of station.lines) {
      const lineUuid = await uuidv5(`line:${line.id}`);
      const rawStatus = (line as any).status ?? "active";
      const status = coerceLineStatus(rawStatus) ?? "active";
      if (rawStatus !== status) {
        transformations.push({
          table: "lines",
          status: "transformed",
          legacyId: line.id,
          newId: lineUuid,
          message: `حالة الخط تم تصحيحها: ${String(rawStatus)} → ${status}`,
        });
      }
      const vehicle = isVehicleType(line.vehicleType) ? line.vehicleType : VEHICLE_TYPES[0];
      if (line.vehicleType && vehicle !== line.vehicleType) {
        transformations.push({
          table: "lines",
          status: "transformed",
          legacyId: line.id,
          newId: lineUuid,
          message: `نوع المركبة "${line.vehicleType}" غير معروف، استُبدل بـ ${vehicle}`,
        });
      }
      const cars = Math.max(0, Math.min(99, Math.floor(Number(line.cars ?? 0)) || 0));

      lines.push({
        id: lineUuid,
        station_id: stationUuid,
        destination: line.destination,
        color: line.color || "#FFC800",
        vehicle_type: vehicle,
        status,
        cars,
        pickup_area: line.pickupArea ?? null,
        zone_x: line.zone?.x ?? null,
        zone_y: line.zone?.y ?? null,
        zone_w: line.zone?.w ?? null,
        zone_h: line.zone?.h ?? null,
        is_published: true,
      });

      layoutZones.push({
        id: await uuidv5(`zone:${line.id}`),
        station_id: stationUuid,
        zone_key: `bay-${line.id}`,
        label: line.destination,
        x: line.zone?.x ?? 0,
        y: line.zone?.y ?? 0,
        w: line.zone?.w ?? 0,
        h: line.zone?.h ?? 0,
      });

      let position = 0;
      for (const stop of line.stops ?? []) {
        position += 1;
        routeStops.push({
          id: await uuidv5(`stop:${line.id}:${stop.id}`),
          line_id: lineUuid,
          position,
          name: stop.name,
          lat: stop.lat,
          lng: stop.lng,
          keywords: [],
        });
      }
    }
  }

  return {
    snapshot: {
      schema: "phase2-v1",
      exportedAt: new Date().toISOString(),
      scope: {},
      stations,
      lines,
      route_stops: routeStops,
      layout_zones: layoutZones,
      station_layouts: stationLayouts,
    },
    transformations,
  };
}

function validatePlan(plan: Plan, report: MigrationReport) {
  const stationIds = new Set(plan.snapshot.stations.map((s: any) => s.id));
  const lineIds = new Set(plan.snapshot.lines.map((l: any) => l.id));

  for (const line of plan.snapshot.lines as any[]) {
    if (!stationIds.has(line.station_id)) {
      record(report, {
        table: "lines",
        status: "error",
        legacyId: line.id,
        message: `الخط مرتبط بموقف غير موجود في الخطة (${line.station_id}).`,
      });
    }
    if (!line.destination?.trim?.()) {
      record(report, {
        table: "lines",
        status: "error",
        legacyId: line.id,
        message: `خط بدون وجهة (${line.id}).`,
      });
    }
  }

  for (const stop of plan.snapshot.route_stops as any[]) {
    if (!lineIds.has(stop.line_id)) {
      record(report, {
        table: "route_stops",
        status: "error",
        legacyId: stop.id,
        message: `محطة مرتبطة بخط غير موجود في الخطة.`,
      });
    }
    if (!Number.isFinite(Number(stop.lat)) || !Number.isFinite(Number(stop.lng))) {
      record(report, {
        table: "route_stops",
        status: "error",
        legacyId: stop.id,
        message: `محطة بدون إحداثيات صالحة (${stop.name ?? stop.id}).`,
      });
    }
  }
}

export type MigrationOptions = { dryRun?: boolean };

export async function migrateLegacySeed(opts: MigrationOptions = {}): Promise<MigrationReport> {
  const dryRun = !!opts.dryRun;
  const report = emptyReport(dryRun);

  if (!isDevMode()) {
    record(report, {
      table: "stations",
      status: "error",
      legacyId: "*",
      message: "نقل البيانات المحلية متاح في وضع التطوير فقط.",
    });
    return report;
  }

  const plan = await buildPlan();
  report.totals.stationsPlanned = plan.snapshot.stations.length;
  report.totals.linesPlanned = plan.snapshot.lines.length;
  report.totals.stopsPlanned = plan.snapshot.route_stops.length;
  for (const entry of plan.transformations) record(report, entry);

  validatePlan(plan, report);
  if (!report.ok) return report;

  const preview = await previewSnapshot(plan.snapshot);
  for (const err of preview.errors) {
    record(report, {
      table: "stations",
      status: "error",
      legacyId: "*",
      message: err.message,
    });
  }
  if (!report.ok) return report;

  if (dryRun) {
    const skipped =
      preview.willOverwrite.stations +
      preview.willOverwrite.lines +
      preview.willOverwrite.route_stops +
      preview.willOverwrite.layout_zones;
    report.totals.skipped += skipped;
    return report;
  }

  const result = await importSnapshot(plan.snapshot, { additive: true });
  if (!result.ok) {
    record(report, {
      table: "stations",
      status: "error",
      legacyId: "*",
      message: result.error ?? "تعذر استيراد البيانات المحلية.",
    });
    for (const entry of result.report) {
      if (entry.level === "error") {
        record(report, {
          table: "stations",
          status: "error",
          legacyId: "*",
          message: entry.message,
        });
      }
    }
    return report;
  }

  report.totals.imported +=
    result.counts.stations.inserted +
    result.counts.lines.inserted +
    result.counts.route_stops.inserted +
    result.counts.layout_zones.inserted +
    result.counts.station_layouts.inserted;

  report.totals.skipped +=
    result.counts.stations.skipped +
    result.counts.lines.skipped +
    result.counts.route_stops.skipped +
    result.counts.layout_zones.skipped +
    result.counts.station_layouts.skipped +
    result.counts.stations.overwritten +
    result.counts.lines.overwritten +
    result.counts.route_stops.overwritten +
    result.counts.layout_zones.overwritten +
    result.counts.station_layouts.overwritten;

  return report;
}
