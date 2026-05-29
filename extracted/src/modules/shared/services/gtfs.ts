// ---------------------------------------------------------------------------
// GTFS-like export + interoperability readiness checks.
//
// `Snapshot` shape (so the current export/import flow keeps working) and
// projects it into GTFS-aligned records for open-data publishing.
//
// We intentionally call this "GTFS-like" — not strict GTFS — because:
//   • our network has no fixed schedules (frequencies are demand-driven),
//   • not all stops have stable coordinates,
//   • some routes are informal / community.
// The mapping below documents every compromise. See docs/INTEROPERABILITY.md
// for the full table.
//
// Backward compatibility:
//   • The function `snapshotToGtfs(snap)` is read-only — it never mutates
//     the snapshot or hits the database.
//   • Existing JSON snapshot import/export remains the source of truth for
//     in-platform editing. GTFS-like CSVs are an additive open-data layer.
// ---------------------------------------------------------------------------

import type { Snapshot } from "./snapshot";
import { deriveTransportMode, type TransportMode } from "@/lib/transportMode";

// ── GTFS route_type mapping ────────────────────────────────────────────────
// GTFS spec uses a small enum for vehicle category. We map our internal
// transport_mode onto it; informal modes default to "Bus" (3) which is the
// most permissive bucket open-data consumers know how to render.
export const GTFS_ROUTE_TYPE: Record<TransportMode, number> = {
  bus: 3, // Bus
  microbus: 3, // Bus (no GTFS code for microbus → use 3 + extended attr)
  minibus: 3, // Bus
  station_taxi: 1500, // GTFS-extended: Taxi service
  community: 715, // GTFS-extended: Demand and Response Bus Service
};

// Extended (non-spec) attribute used by some open-data portals to carry
// the original informal classification without losing fidelity.
export const EXTENDED_MODE_TAG: Record<TransportMode, string> = {
  bus: "formal_bus",
  microbus: "informal_microbus",
  minibus: "informal_minibus",
  station_taxi: "station_taxi",
  community: "community_transport",
};

// ── Output record types ────────────────────────────────────────────────────
// One row per GTFS-like file. Field names match the GTFS spec exactly so
// the resulting CSVs can be consumed by GTFS validators with minimal fixup.
export type GtfsAgency = {
  agency_id: string;
  agency_name: string;
  agency_url: string;
  agency_timezone: string;
  agency_lang: string;
};

export type GtfsStop = {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  /** 0 = stop/platform, 1 = station. Mirrors GTFS location_type. */
  location_type: 0 | 1;
  /** For platforms inside a station, points to the station stop_id. */
  parent_station: string;
  /** Extended: our stop_class (formal/semi_formal/informal). */
  stop_desc: string;
};

export type GtfsRoute = {
  route_id: string;
  agency_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  route_color: string; // 6-char hex, no '#'
  /** Extended attribute — keeps informal mode tag for round-trips. */
  route_desc: string;
};

export type GtfsTrip = {
  trip_id: string;
  route_id: string;
  service_id: string;
  trip_headsign: string;
  direction_id: 0 | 1;
};

export type GtfsStopTime = {
  trip_id: string;
  stop_id: string;
  stop_sequence: number;
  // We have no schedules; leave times blank but keep the column so consumers
  // that require these fields can fill defaults.
  arrival_time: string;
  departure_time: string;
};

export type GtfsBundle = {
  agency: GtfsAgency[];
  stops: GtfsStop[];
  routes: GtfsRoute[];
  trips: GtfsTrip[];
  stop_times: GtfsStopTime[];
  /** Per-file CSV strings — ready to download or zip externally. */
  csv: Record<"agency" | "stops" | "routes" | "trips" | "stop_times", string>;
};

export type GtfsExportOptions = {
  agencyId?: string;
  agencyName?: string;
  agencyUrl?: string;
  agencyTimezone?: string; // e.g. "Africa/Cairo"
  agencyLang?: string; // e.g. "ar"
};

const DEFAULTS: Required<GtfsExportOptions> = {
  agencyId: "platform",
  agencyName: "Mawqaf",
  agencyUrl: "https://example.invalid",
  agencyTimezone: "Africa/Cairo",
  agencyLang: "ar",
};

// ── Mapping ────────────────────────────────────────────────────────────────

export function snapshotToGtfs(
  snap: Snapshot,
  opts: GtfsExportOptions = {}
): GtfsBundle {
  const cfg = { ...DEFAULTS, ...opts };

  const agency: GtfsAgency[] = [
    {
      agency_id: cfg.agencyId,
      agency_name: cfg.agencyName,
      agency_url: cfg.agencyUrl,
      agency_timezone: cfg.agencyTimezone,
      agency_lang: cfg.agencyLang,
    },
  ];

  // Stations → parent stops (location_type=1). Route stops → child stops.
  const stops: GtfsStop[] = [];
  for (const s of snap.stations) {
    stops.push({
      stop_id: `station:${s.id}`,
      stop_name: s.name ?? "",
      stop_lat: Number(s.lat ?? 0),
      stop_lon: Number(s.lng ?? 0),
      location_type: 1,
      parent_station: "",
      stop_desc: s.area ?? "",
    });
  }
  for (const rs of snap.route_stops) {
    // Find owning line → station for parent_station linkage
    const owningLine = snap.lines.find((l: any) => l.id === rs.line_id);
    const parent = owningLine ? `station:${owningLine.station_id}` : "";
    stops.push({
      stop_id: `stop:${rs.id}`,
      stop_name: rs.name ?? "",
      stop_lat: Number(rs.lat ?? 0),
      stop_lon: Number(rs.lng ?? 0),
      location_type: 0,
      parent_station: parent,
      stop_desc: rs.stop_class ?? "informal",
    });
  }

  const routes: GtfsRoute[] = snap.lines.map((l: any) => {
    const mode = deriveTransportMode({
      transport_mode: l.transport_mode,
      vehicle_type: l.vehicle_type,
    });
    return {
      route_id: `line:${l.id}`,
      agency_id: cfg.agencyId,
      route_short_name: shortName(l.destination),
      route_long_name: l.destination ?? "",
      route_type: GTFS_ROUTE_TYPE[mode],
      route_color: hexNoHash(l.color),
      route_desc: EXTENDED_MODE_TAG[mode],
    };
  });

  // One trip per line (no schedules in our system).
  const trips: GtfsTrip[] = snap.lines.map((l: any) => ({
    trip_id: `trip:${l.id}`,
    route_id: `line:${l.id}`,
    service_id: "always",
    trip_headsign: l.destination ?? "",
    direction_id: 0,
  }));

  // stop_times rows in route order. We deliberately leave time fields blank.
  const stop_times: GtfsStopTime[] = [];
  // Group route_stops by line_id, sort by position
  const byLine = new Map<string, any[]>();
  for (const rs of snap.route_stops) {
    const arr = byLine.get(rs.line_id) ?? [];
    arr.push(rs);
    byLine.set(rs.line_id, arr);
  }
  for (const arr of byLine.values()) {
    arr.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }
  for (const l of snap.lines) {
    const arr = byLine.get(l.id) ?? [];
    arr.forEach((rs, i) => {
      stop_times.push({
        trip_id: `trip:${l.id}`,
        stop_id: `stop:${rs.id}`,
        stop_sequence: i + 1,
        arrival_time: "",
        departure_time: "",
      });
    });
  }

  const csv = {
    agency: toCsv(agency),
    stops: toCsv(stops),
    routes: toCsv(routes),
    trips: toCsv(trips),
    stop_times: toCsv(stop_times),
  };

  return { agency, stops, routes, trips, stop_times, csv };
}

// ── Readiness checks ───────────────────────────────────────────────────────
// These are *interoperability* checks, distinct from in-platform validation
// (which already exists). They surface things that would block or degrade an
// open-data publication: missing coordinates, blank names, dangling FKs, etc.

export type ReadinessSeverity = "blocker" | "warning" | "info";
export type ReadinessIssue = {
  severity: ReadinessSeverity;
  /** i18n key resolved by UI. */
  key: string;
  /** Optional vars for the i18n string. */
  vars?: Record<string, string | number>;
  /** Human-readable entity hint (id or name). */
  entity?: string;
};

export type ReadinessReport = {
  totals: {
    stations: number;
    lines: number;
    stops: number;
    publishedLines: number;
    geocodedStops: number;
  };
  blockers: ReadinessIssue[];
  warnings: ReadinessIssue[];
  infos: ReadinessIssue[];
  /** Convenience: readyToPublish === blockers.length === 0 */
  readyToPublish: boolean;
};

export function checkExportReadiness(snap: Snapshot): ReadinessReport {
  const blockers: ReadinessIssue[] = [];
  const warnings: ReadinessIssue[] = [];
  const infos: ReadinessIssue[] = [];

  const stationIds = new Set(snap.stations.map((s: any) => s.id));
  const lineIds = new Set(snap.lines.map((l: any) => l.id));

  let publishedLines = 0;
  let geocodedStops = 0;

  // Stations
  for (const s of snap.stations) {
    if (!isFiniteCoord(s.lat) || !isFiniteCoord(s.lng)) {
      blockers.push({
        severity: "blocker",
        key: "interop.issue.stationNoCoords",
        entity: s.name ?? s.id,
      });
    }
    if (!s.name || !String(s.name).trim()) {
      blockers.push({
        severity: "blocker",
        key: "interop.issue.stationNoName",
        entity: s.id,
      });
    }
    if (!s.is_published) {
      infos.push({
        severity: "info",
        key: "interop.issue.stationUnpublished",
        entity: s.name ?? s.id,
      });
    }
  }

  // Lines
  for (const l of snap.lines) {
    if (!stationIds.has(l.station_id)) {
      blockers.push({
        severity: "blocker",
        key: "interop.issue.lineDanglingStation",
        entity: l.destination ?? l.id,
      });
    }
    if (!l.destination || !String(l.destination).trim()) {
      blockers.push({
        severity: "blocker",
        key: "interop.issue.lineNoDestination",
        entity: l.id,
      });
    }
    if (!l.transport_mode) {
      warnings.push({
        severity: "warning",
        key: "interop.issue.lineNoMode",
        entity: l.destination ?? l.id,
      });
    }
    if (!l.color || !/^#?[0-9a-fA-F]{6}$/.test(String(l.color))) {
      warnings.push({
        severity: "warning",
        key: "interop.issue.lineBadColor",
        entity: l.destination ?? l.id,
      });
    }
    if (l.is_published) publishedLines++;
  }

  // Route stops
  const stopsByLine = new Map<string, number>();
  for (const rs of snap.route_stops) {
    stopsByLine.set(rs.line_id, (stopsByLine.get(rs.line_id) ?? 0) + 1);
    if (!lineIds.has(rs.line_id)) {
      blockers.push({
        severity: "blocker",
        key: "interop.issue.stopDanglingLine",
        entity: rs.name ?? rs.id,
      });
    }
    if (!rs.name || !String(rs.name).trim()) {
      blockers.push({
        severity: "blocker",
        key: "interop.issue.stopNoName",
        entity: rs.id,
      });
    }
    if (isFiniteCoord(rs.lat) && isFiniteCoord(rs.lng)) {
      geocodedStops++;
    } else {
      warnings.push({
        severity: "warning",
        key: "interop.issue.stopNoCoords",
        entity: rs.name ?? rs.id,
      });
    }
    if (!rs.stop_class) {
      infos.push({
        severity: "info",
        key: "interop.issue.stopNoClass",
        entity: rs.name ?? rs.id,
      });
    }
  }

  // Lines with too few stops
  for (const l of snap.lines) {
    const count = stopsByLine.get(l.id) ?? 0;
    if (count < 2) {
      warnings.push({
        severity: "warning",
        key: "interop.issue.lineTooFewStops",
        vars: { n: count },
        entity: l.destination ?? l.id,
      });
    }
  }

  return {
    totals: {
      stations: snap.stations.length,
      lines: snap.lines.length,
      stops: snap.route_stops.length,
      publishedLines,
      geocodedStops,
    },
    blockers,
    warnings,
    infos,
    readyToPublish: blockers.length === 0,
  };
}

// ── CSV helpers ────────────────────────────────────────────────────────────

/** Minimal RFC-4180 CSV serializer. Quotes fields that contain ", , or \n. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const out: string[] = [headers.join(",")];
  for (const row of rows) {
    out.push(headers.map((h) => csvCell(row[h])).join(","));
  }
  return out.join("\n");
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function shortName(destination: unknown): string {
  const s = String(destination ?? "").trim();
  if (!s) return "";
  // Take first whitespace-delimited token, capped at 8 chars (GTFS hint).
  return s.split(/\s+/)[0].slice(0, 8);
}

function hexNoHash(c: unknown): string {
  const s = String(c ?? "").replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : "FFC800";
}

function isFiniteCoord(v: unknown): boolean {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0;
}

// ── Schema mapping (machine-readable, used by docs page + tests) ──────────
export type MappingRow = {
  ourEntity: string;
  ourField: string;
  gtfsFile: string;
  gtfsField: string;
  notes: string;
};

export const SCHEMA_MAPPING: MappingRow[] = [
  { ourEntity: "stations", ourField: "id", gtfsFile: "stops.txt", gtfsField: "stop_id", notes: "Prefixed with 'station:' to namespace" },
  { ourEntity: "stations", ourField: "name", gtfsFile: "stops.txt", gtfsField: "stop_name", notes: "" },
  { ourEntity: "stations", ourField: "lat/lng", gtfsFile: "stops.txt", gtfsField: "stop_lat/stop_lon", notes: "" },
  { ourEntity: "stations", ourField: "(implicit)", gtfsFile: "stops.txt", gtfsField: "location_type=1", notes: "Marks station-level stop" },
  { ourEntity: "lines", ourField: "id", gtfsFile: "routes.txt", gtfsField: "route_id", notes: "Prefixed with 'line:'" },
  { ourEntity: "lines", ourField: "destination", gtfsFile: "routes.txt", gtfsField: "route_long_name", notes: "First token also used as route_short_name" },
  { ourEntity: "lines", ourField: "color", gtfsFile: "routes.txt", gtfsField: "route_color", notes: "Hex without '#'" },
  { ourEntity: "lines", ourField: "transport_mode", gtfsFile: "routes.txt", gtfsField: "route_type", notes: "bus→3, station_taxi→1500, community→715" },
  { ourEntity: "lines", ourField: "transport_mode", gtfsFile: "routes.txt", gtfsField: "route_desc", notes: "Carries informal tag (microbus/minibus)" },
  { ourEntity: "lines", ourField: "(implicit)", gtfsFile: "trips.txt", gtfsField: "trip_id", notes: "One trip per line — we have no schedules" },
  { ourEntity: "route_stops", ourField: "id", gtfsFile: "stops.txt", gtfsField: "stop_id", notes: "Prefixed with 'stop:'" },
  { ourEntity: "route_stops", ourField: "name", gtfsFile: "stops.txt", gtfsField: "stop_name", notes: "" },
  { ourEntity: "route_stops", ourField: "lat/lng", gtfsFile: "stops.txt", gtfsField: "stop_lat/stop_lon", notes: "Required for publishing" },
  { ourEntity: "route_stops", ourField: "stop_class", gtfsFile: "stops.txt", gtfsField: "stop_desc", notes: "Carries formal/semi_formal/informal" },
  { ourEntity: "route_stops", ourField: "line_id + position", gtfsFile: "stop_times.txt", gtfsField: "trip_id + stop_sequence", notes: "Times left blank — demand-driven service" },
  { ourEntity: "(synthetic)", ourField: "agency", gtfsFile: "agency.txt", gtfsField: "agency_*", notes: "Single-agency export; configurable" },
];
