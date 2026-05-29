import { describe, it, expect } from "vitest";
import { deriveAnalytics, normalizeQuery, type AnalyticsInputs } from "./analytics";

const NOW = new Date("2026-04-28T12:00:00Z").getTime();
const min = (m: number) => new Date(NOW - m * 60 * 1000).toISOString();

function buildInputs(overrides: Partial<AnalyticsInputs> = {}): AnalyticsInputs {
  return {
    now: NOW,
    windowDays: 14,
    stations: [
      { id: "st1", name: "رمسيس", is_published: true },
      { id: "st2", name: "العتبة", is_published: true },
    ],
    lines: [
      { id: "l1", station_id: "st1", destination: "المعادي", status: "active", cars: 5, is_published: true, cars_updated_at: min(5) },
      { id: "l2", station_id: "st1", destination: "حلوان", status: "stopped", cars: 0, is_published: true, cars_updated_at: min(200) },
      { id: "l3", station_id: "st2", destination: "الجيزة", status: "active", cars: 3, is_published: true, cars_updated_at: min(40) },
      { id: "l4", station_id: "st2", destination: "draft-only", status: "active", cars: 1, is_published: false, cars_updated_at: min(10) },
    ],
    routeStops: [
      { line_id: "l1", name: "كورنيش المعادي", keywords: ["معادي"] },
      { line_id: "l3", name: "ميدان الجيزة", keywords: null },
    ],
    searchLogs: [
      { query: "المعادي", result_count: 2, created_at: min(10) },
      { query: "المعادي", result_count: 2, created_at: min(20) },
      { query: "أكتوبر", result_count: 0, created_at: min(30) },
      { query: "أكتوبر", result_count: 0, created_at: min(60) },
      { query: "الجيزة", result_count: 1, created_at: min(15) },
    ],
    issues: [
      { id: "i1", level: "error", category: "line_no_stops", entity: "line", title: "no stops", detail: "", lineId: "l2", stationId: "st1" },
      { id: "i2", level: "warning", category: "stop_keywords", entity: "line", title: "kw", detail: "", lineId: "l2", stationId: "st1" },
      { id: "i3", level: "warning", category: "station_area", entity: "station", title: "area", detail: "", stationId: "st2" },
    ],
    ...overrides,
  };
}

describe("normalizeQuery", () => {
  it("strips Arabic diacritics and lowercases", () => {
    expect(normalizeQuery("الْمَعَادِي")).toBe("المعادي");
    expect(normalizeQuery("  Cairo  ")).toBe("cairo");
  });
});

describe("deriveAnalytics", () => {
  it("ranks most-requested lines by search hits", () => {
    const out = deriveAnalytics(buildInputs());
    expect(out.topRequestedLines[0].destination).toBe("المعادي");
    expect(out.topRequestedLines[0].requests).toBe(2);
  });

  it("captures unserved queries (no matching line)", () => {
    const out = deriveAnalytics(buildInputs());
    const akt = out.unservedQueries.find((q) => q.query.endsWith("كتوبر"));
    expect(akt?.searches).toBe(2);
  });

  it("computes freshness buckets and median", () => {
    const out = deriveAnalytics(buildInputs());
    expect(out.freshness.totalPublished).toBe(3);
    expect(out.freshness.buckets.find((b) => b.label === "fresh")?.count).toBe(1);
    expect(out.freshness.buckets.find((b) => b.label === "very_stale")?.count).toBe(1);
    expect(out.freshness.medianAgeMin).toBeGreaterThan(0);
  });

  it("ranks problem entities by error count", () => {
    const out = deriveAnalytics(buildInputs());
    expect(out.problemEntities[0].id).toBe("l2");
    expect(out.problemEntities[0].errors).toBe(1);
    expect(out.problemEntities[0].warnings).toBe(1);
  });

  it("aggregates demand by hour and day", () => {
    const out = deriveAnalytics(buildInputs());
    const totalHourly = out.demandByHour.reduce((s, b) => s + b.count, 0);
    expect(totalHourly).toBe(5);
    const totalDaily = out.demandByDay.reduce((s, b) => s + b.count, 0);
    expect(totalDaily).toBe(5);
  });

  it("excludes unpublished lines from availability", () => {
    const out = deriveAnalytics(buildInputs());
    expect(out.lineAvailability.find((l) => l.line_id === "l4")).toBeUndefined();
  });
});
