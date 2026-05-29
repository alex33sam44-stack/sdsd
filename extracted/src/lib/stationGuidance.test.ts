import { describe, it, expect } from "vitest";
import {
  estimateBayWalkSeconds,
  formatWalkDuration,
  directionHint,
  locationConfidence,
  projectUserToSvg,
  zoneCenter,
  ENTRANCE_SVG,
} from "./stationGuidance";

describe("zoneCenter", () => {
  it("computes the rectangle center", () => {
    expect(zoneCenter({ x: 10, y: 20, w: 40, h: 10 })).toEqual({ x: 30, y: 25 });
  });
});

describe("estimateBayWalkSeconds", () => {
  it("returns a small positive number for a near bay", () => {
    const s = estimateBayWalkSeconds({ x: 80, y: 44, w: 10, h: 10 });
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(60);
  });
  it("returns a larger number for a far bay", () => {
    const near = estimateBayWalkSeconds({ x: 80, y: 44, w: 10, h: 10 });
    const far = estimateBayWalkSeconds({ x: 8, y: 15, w: 38, h: 18 });
    expect(far).toBeGreaterThan(near);
  });
});

describe("formatWalkDuration", () => {
  it("Arabic phrasing", () => {
    expect(formatWalkDuration(0, "ar")).toBe("أقل من دقيقة");
    expect(formatWalkDuration(40, "ar")).toBe("أقل من دقيقة");
    expect(formatWalkDuration(60, "ar")).toBe("حوالي دقيقة");
    expect(formatWalkDuration(120, "ar")).toBe("حوالي دقيقتين");
    expect(formatWalkDuration(300, "ar")).toMatch(/^حوالي \d+ دقائق$/);
  });
  it("English fallback", () => {
    expect(formatWalkDuration(120, "en")).toBe("~2 min");
  });
});

describe("directionHint", () => {
  it("aligned bay deep inside → go_forward", () => {
    expect(directionHint({ x: 8, y: 46, w: 38, h: 8 })).toBe("go_forward");
  });
  it("bay below entrance → turn_right", () => {
    expect(directionHint({ x: 80, y: 80, w: 10, h: 10 })).toBe("turn_right");
  });
  it("bay above entrance → turn_left", () => {
    expect(directionHint({ x: 80, y: 5, w: 10, h: 10 })).toBe("turn_left");
  });
  it("bay right next to entrance → platform_ahead", () => {
    expect(directionHint({ x: 88, y: 47, w: 6, h: 6 })).toBe("platform_ahead");
  });
});

describe("locationConfidence", () => {
  it("high when very accurate and on-site", () => {
    expect(locationConfidence(15, 30)).toBe("high");
  });
  it("medium for 50m accuracy nearby", () => {
    expect(locationConfidence(50, 200)).toBe("medium");
  });
  it("low for 150m accuracy 800m away", () => {
    expect(locationConfidence(150, 800)).toBe("low");
  });
  it("unknown when accuracy is huge", () => {
    expect(locationConfidence(5000, 200)).toBe("unknown");
  });
  it("unknown when input is missing", () => {
    expect(locationConfidence(null, 100)).toBe("unknown");
  });
});

describe("projectUserToSvg", () => {
  const station = { lat: 30.0626, lng: 31.2497 };
  it("returns entrance with low confidence when far", () => {
    const r = projectUserToSvg(30.07, 31.27, station, 50);
    expect(r.confidence).toBe("unknown");
    expect(r.point).toEqual(ENTRANCE_SVG);
  });
  it("projects nearby high-accuracy user to a clamped SVG point", () => {
    // ~30m east, accuracy 10m → high confidence
    const r = projectUserToSvg(station.lat, station.lng + 30 / 92_000, station, 10);
    expect(r.confidence).toBe("high");
    expect(r.point.x).toBeGreaterThan(50);
    expect(r.point.x).toBeLessThanOrEqual(98);
    expect(r.point.y).toBeGreaterThanOrEqual(2);
    expect(r.point.y).toBeLessThanOrEqual(98);
  });
});
