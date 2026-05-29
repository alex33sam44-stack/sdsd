import { describe, it, expect } from "vitest";
import {
  freshnessCategory,
  computeConfidence,
  scoreResult,
} from "./ranking";

const now = new Date("2026-04-28T12:00:00Z").getTime();
const minsAgo = (m: number) => new Date(now - m * 60_000).toISOString();

describe("freshnessCategory", () => {
  it("buckets updates correctly", () => {
    expect(freshnessCategory(minsAgo(2), now)).toBe("now");
    expect(freshnessCategory(minsAgo(45), now)).toBe("recent");
    expect(freshnessCategory(minsAgo(180), now)).toBe("stale");
    expect(freshnessCategory(null, now)).toBe("stale");
    expect(freshnessCategory("not-a-date", now)).toBe("stale");
  });
});

describe("computeConfidence", () => {
  it("returns high for fresh + active + complete + pickup area", () => {
    const c = computeConfidence(
      { updatedAt: minsAgo(2), status: "active", stopsCount: 5, hasPickupArea: true },
      now
    );
    expect(c.level).toBe("high");
    expect(c.score).toBeGreaterThanOrEqual(70);
  });
  it("returns medium for recent + active + 3 stops", () => {
    const c = computeConfidence(
      { updatedAt: minsAgo(60), status: "active", stopsCount: 3, hasPickupArea: false },
      now
    );
    expect(c.level).toBe("medium");
  });
  it("returns low for stale + missing data", () => {
    const c = computeConfidence(
      { updatedAt: minsAgo(500), status: "paused", stopsCount: 1 },
      now
    );
    expect(c.level).toBe("low");
  });
});

describe("scoreResult", () => {
  it("ranks direct + close + active + fresh higher than indirect + far + stale", () => {
    const a = scoreResult(
      {
        isDirect: true,
        walkToPickupKm: 0.3,
        walkFromDropoffKm: 0.2,
        cars: 6,
        status: "active",
        updatedAt: minsAgo(2),
      },
      now
    );
    const b = scoreResult(
      {
        isDirect: false,
        walkToPickupKm: 1.5,
        walkFromDropoffKm: 1.6,
        cars: 0,
        status: "paused",
        updatedAt: minsAgo(500),
      },
      now
    );
    expect(a).toBeGreaterThan(b);
  });
});
