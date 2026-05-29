import { describe, it, expect } from "vitest";
import {
  snapshotToGtfs,
  checkExportReadiness,
  toCsv,
  GTFS_ROUTE_TYPE,
  EXTENDED_MODE_TAG,
  SCHEMA_MAPPING,
} from "./gtfs";
import type { Snapshot } from "./snapshot";

const baseSnap = (): Snapshot => ({
  schema: "phase2-v1" as Snapshot["schema"],
  exportedAt: "2026-04-28T00:00:00.000Z",
  scope: {},
  stations: [
    { id: "s1", name: "موقف وسط البلد", area: "وسط", lat: 30.05, lng: 31.23, is_published: true },
  ],
  lines: [
    {
      id: "l1",
      station_id: "s1",
      destination: "المعادي",
      color: "#FFC800",
      vehicle_type: "ميكروباص",
      transport_mode: "microbus",
      is_published: true,
    },
  ],
  route_stops: [
    { id: "r1", line_id: "l1", position: 1, name: "وسط البلد", lat: 30.05, lng: 31.23, stop_class: "formal" },
    { id: "r2", line_id: "l1", position: 2, name: "المعادي", lat: 30.0, lng: 31.25, stop_class: "informal" },
  ],
  layout_zones: [],
  station_layouts: [],
});

describe("gtfs/snapshotToGtfs", () => {
  it("emits one agency row by default", () => {
    const b = snapshotToGtfs(baseSnap());
    expect(b.agency).toHaveLength(1);
    expect(b.agency[0].agency_id).toBe("platform");
  });

  it("maps stations to location_type=1 and route_stops to location_type=0 with parent linkage", () => {
    const b = snapshotToGtfs(baseSnap());
    const station = b.stops.find((s) => s.stop_id === "station:s1");
    const stop = b.stops.find((s) => s.stop_id === "stop:r1");
    expect(station?.location_type).toBe(1);
    expect(stop?.location_type).toBe(0);
    expect(stop?.parent_station).toBe("station:s1");
    expect(stop?.stop_desc).toBe("formal");
  });

  it("maps lines to GTFS routes with route_type from transport_mode", () => {
    const b = snapshotToGtfs(baseSnap());
    expect(b.routes).toHaveLength(1);
    expect(b.routes[0].route_type).toBe(GTFS_ROUTE_TYPE.microbus);
    expect(b.routes[0].route_desc).toBe(EXTENDED_MODE_TAG.microbus);
    expect(b.routes[0].route_color).toBe("FFC800");
  });

  it("emits stop_times rows in route order with blank times", () => {
    const b = snapshotToGtfs(baseSnap());
    expect(b.stop_times).toHaveLength(2);
    expect(b.stop_times[0].stop_sequence).toBe(1);
    expect(b.stop_times[1].stop_sequence).toBe(2);
    expect(b.stop_times[0].arrival_time).toBe("");
  });

  it("classifies station_taxi and community with extended GTFS route_types", () => {
    const snap = baseSnap();
    snap.lines[0].transport_mode = "station_taxi";
    expect(snapshotToGtfs(snap).routes[0].route_type).toBe(1500);
    snap.lines[0].transport_mode = "community";
    expect(snapshotToGtfs(snap).routes[0].route_type).toBe(715);
  });
});

describe("gtfs/checkExportReadiness", () => {
  it("flags ready when minimum data is present", () => {
    const r = checkExportReadiness(baseSnap());
    expect(r.readyToPublish).toBe(true);
    expect(r.totals.stations).toBe(1);
    expect(r.totals.publishedLines).toBe(1);
    expect(r.totals.geocodedStops).toBe(2);
  });

  it("blocks when a station has no coordinates", () => {
    const snap = baseSnap();
    snap.stations[0].lat = null;
    const r = checkExportReadiness(snap);
    expect(r.readyToPublish).toBe(false);
    expect(r.blockers.some((b) => b.key === "interop.issue.stationNoCoords")).toBe(true);
  });

  it("blocks when a line points to a missing station", () => {
    const snap = baseSnap();
    snap.lines[0].station_id = "missing";
    const r = checkExportReadiness(snap);
    expect(r.blockers.some((b) => b.key === "interop.issue.lineDanglingStation")).toBe(true);
  });

  it("warns when a line has fewer than 2 stops", () => {
    const snap = baseSnap();
    snap.route_stops = [snap.route_stops[0]];
    const r = checkExportReadiness(snap);
    expect(r.warnings.some((w) => w.key === "interop.issue.lineTooFewStops")).toBe(true);
  });

  it("warns when a stop is missing coordinates", () => {
    const snap = baseSnap();
    snap.route_stops[1].lat = null;
    const r = checkExportReadiness(snap);
    expect(r.warnings.some((w) => w.key === "interop.issue.stopNoCoords")).toBe(true);
  });
});

describe("gtfs/toCsv", () => {
  it("quotes fields containing commas, quotes, or newlines", () => {
    const csv = toCsv([{ a: "hello, world", b: 'she said "hi"', c: "line1\nline2" }]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("a,b,c");
    expect(lines[1]).toContain('"hello, world"');
    expect(lines[1]).toContain('"she said ""hi"""');
  });

  it("emits empty string for null/undefined", () => {
    const csv = toCsv([{ a: null, b: undefined, c: 0 }]);
    expect(csv.split("\n")[1]).toBe(",,0");
  });
});

describe("gtfs/SCHEMA_MAPPING", () => {
  it("documents every internal entity used by the exporter", () => {
    const entities = new Set(SCHEMA_MAPPING.map((m) => m.ourEntity));
    expect(entities.has("stations")).toBe(true);
    expect(entities.has("lines")).toBe(true);
    expect(entities.has("route_stops")).toBe(true);
  });
});
