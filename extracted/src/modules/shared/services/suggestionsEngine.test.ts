import { describe, expect, it } from "vitest";
import {
  buildSuggestions,
  STALE_LINE_MIN,
  STALE_LINE_WARN_MIN,
  ZERO_CARS_GRACE_MIN,
  DEMAND_THRESHOLD,
  type LineRow,
  type StopRow,
  type ZoneRow,
} from "./suggestionsEngine";

const NOW = Date.UTC(2026, 3, 28, 12, 0, 0);
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

const baseLine = (over: Partial<LineRow>): LineRow => ({
  id: "L", station_id: "S", destination: "وجهة", status: "active", cars: 5,
  is_published: true, cars_updated_at: minsAgo(1), pickup_area: null,
  zone_x: null, zone_y: null, zone_w: null, zone_h: null, ...over,
});

describe("suggestionsEngine", () => {
  it("flags stale published lines with proper severity", () => {
    const r = buildSuggestions({
      lines: [
        baseLine({ id: "fresh", cars_updated_at: minsAgo(5) }),
        baseLine({ id: "warn", cars_updated_at: minsAgo(STALE_LINE_WARN_MIN + 1) }),
        baseLine({ id: "high", cars_updated_at: minsAgo(STALE_LINE_MIN + 1) }),
      ],
      stops: [], zones: [], searches: [], now: NOW,
    });
    const stale = r.filter((s) => s.category === "stale_line");
    expect(stale.find((s) => s.id === "stale:fresh")).toBeUndefined();
    expect(stale.find((s) => s.id === "stale:warn")?.severity).toBe("medium");
    expect(stale.find((s) => s.id === "stale:high")?.severity).toBe("high");
  });

  it("flags active lines with zero cars after grace period", () => {
    const r = buildSuggestions({
      lines: [
        baseLine({ id: "ok", cars: 0, cars_updated_at: minsAgo(ZERO_CARS_GRACE_MIN - 1) }),
        baseLine({ id: "bad", cars: 0, cars_updated_at: minsAgo(ZERO_CARS_GRACE_MIN + 5) }),
      ],
      stops: [], zones: [], searches: [], now: NOW,
    });
    expect(r.find((s) => s.id === "zerocars:ok")).toBeUndefined();
    expect(r.find((s) => s.id === "zerocars:bad")?.severity).toBe("medium");
  });

  it("flags stopped+published lines as high", () => {
    const r = buildSuggestions({
      lines: [baseLine({ id: "x", status: "stopped", is_published: true })],
      stops: [], zones: [], searches: [], now: NOW,
    });
    expect(r.find((s) => s.category === "stopped_published")?.severity).toBe("high");
  });

  it("flags orphan zones not matched by any line pickup_area", () => {
    const lines: LineRow[] = [baseLine({ id: "L1", pickup_area: "رصيف 1" })];
    const zones: ZoneRow[] = [
      { id: "Z1", station_id: "S", zone_key: "z1", label: "رصيف 1" },
      { id: "Z2", station_id: "S", zone_key: "z2", label: "رصيف 2" },
    ];
    const r = buildSuggestions({ lines, stops: [], zones, searches: [], now: NOW });
    expect(r.find((s) => s.id === "orphan_zone:Z1")).toBeUndefined();
    expect(r.find((s) => s.id === "orphan_zone:Z2")?.severity).toBe("low");
  });

  it("flags duplicate stop names within the same route", () => {
    const lines = [baseLine({ id: "L1" })];
    const stops: StopRow[] = [
      { id: "s1", line_id: "L1", position: 1, name: "محطة أ" },
      { id: "s2", line_id: "L1", position: 2, name: "محطة أ" },
      { id: "s3", line_id: "L1", position: 3, name: "محطة ب" },
    ];
    const r = buildSuggestions({ lines, stops, zones: [], searches: [], now: NOW });
    const dup = r.find((s) => s.category === "duplicate_stop");
    expect(dup?.severity).toBe("medium");
  });

  it("flags popular searches with no matching coverage", () => {
    const lines = [baseLine({ id: "L1", destination: "حلوان" })];
    const r = buildSuggestions({
      lines, stops: [], zones: [],
      searches: [
        { query: "العاشر من رمضان", count: DEMAND_THRESHOLD + 1 },
        { query: "حلوان", count: DEMAND_THRESHOLD + 1 },
      ],
      now: NOW,
    });
    const noCov = r.filter((s) => s.category === "demand_no_coverage");
    expect(noCov).toHaveLength(1);
    expect(noCov[0].severity).toBe("high");
  });

  it("ignores low-volume searches", () => {
    const r = buildSuggestions({
      lines: [], stops: [], zones: [],
      searches: [{ query: "نادر", count: DEMAND_THRESHOLD - 1 }],
      now: NOW,
    });
    expect(r.find((s) => s.category === "demand_no_coverage")).toBeUndefined();
  });

  it("sorts results by severity high → low", () => {
    const r = buildSuggestions({
      lines: [
        baseLine({ id: "high", status: "stopped", is_published: true }),
        baseLine({ id: "med", cars: 0, cars_updated_at: minsAgo(ZERO_CARS_GRACE_MIN + 1) }),
      ],
      stops: [],
      zones: [{ id: "Z", station_id: "S", zone_key: "z", label: "غير مرتبط" }],
      searches: [], now: NOW,
    });
    expect(r[0].severity).toBe("high");
    expect(r[r.length - 1].severity).toBe("low");
  });
});
