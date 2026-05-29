import { describe, it, expect } from "vitest";
import { deriveMetrics, isStale, STALE_AFTER_MIN, type LiveOpsSnapshot } from "./liveOps";

const now = Date.UTC(2026, 3, 28, 12, 0, 0);
const minsAgo = (m: number) => new Date(now - m * 60_000).toISOString();

const snap: LiveOpsSnapshot = {
  fetchedAt: new Date(now).toISOString(),
  stations: [
    { id: "s1", name: "موقف رمسيس", area: null, is_published: true },
    { id: "s2", name: "موقف غير منشور", area: null, is_published: false },
  ],
  lines: [
    { id: "l1", station_id: "s1", destination: "حلوان", status: "active", cars: 3,
      is_published: true, cars_updated_at: minsAgo(5), updated_at: minsAgo(5) },
    { id: "l2", station_id: "s1", destination: "المعادي", status: "crowded", cars: 0,
      is_published: true, cars_updated_at: minsAgo(10), updated_at: minsAgo(10) },
    { id: "l3", station_id: "s1", destination: "الجيزة", status: "stopped", cars: 0,
      is_published: true, cars_updated_at: minsAgo(20), updated_at: minsAgo(20) },
    { id: "l4", station_id: "s1", destination: "العاشر", status: "active", cars: 2,
      is_published: true, cars_updated_at: minsAgo(STALE_AFTER_MIN + 30), updated_at: minsAgo(120) },
    { id: "l5", station_id: "s1", destination: "مسودة", status: "active", cars: 1,
      is_published: false, cars_updated_at: minsAgo(2), updated_at: minsAgo(2) },
  ],
};

describe("liveOps deriveMetrics", () => {
  const m = deriveMetrics(snap, now);
  it("counts only published stations", () => {
    expect(m.totalStations).toBe(1);
  });
  it("counts only published lines and statuses", () => {
    expect(m.totalLines).toBe(4);
    expect(m.activeLines).toBe(2);
    expect(m.crowdedLines).toBe(1);
    expect(m.stoppedLines).toBe(1);
  });
  it("sums cars across published lines", () => {
    expect(m.totalCars).toBe(5);
  });
  it("flags stale lines", () => {
    expect(m.staleLines.map((l) => l.id)).toEqual(["l4"]);
  });
  it("flags zero-car non-stopped lines", () => {
    expect(m.zeroCarsLines.map((l) => l.id)).toEqual(["l2"]);
  });
  it("lists stopped lines separately", () => {
    expect(m.stoppedLinesList.map((l) => l.id)).toEqual(["l3"]);
  });
  it("collects unpublished lines for review", () => {
    expect(m.unpublishedLines.map((l) => l.id)).toEqual(["l5"]);
  });
});

describe("isStale", () => {
  it("returns true after threshold", () => {
    expect(isStale(minsAgo(STALE_AFTER_MIN + 1), now)).toBe(true);
  });
  it("returns false within threshold", () => {
    expect(isStale(minsAgo(STALE_AFTER_MIN - 1), now)).toBe(false);
  });
});
