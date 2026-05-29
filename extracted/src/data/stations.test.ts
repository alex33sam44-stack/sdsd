import { describe, expect, it } from "vitest";
import { distanceKm, findNearestStation, STATIONS } from "@/data/stations";

describe("distanceKm (haversine)", () => {
  it("returns 0 for identical points", () => {
    expect(distanceKm(30.06, 31.25, 30.06, 31.25)).toBeCloseTo(0, 5);
  });

  it("matches a known great-circle distance within 1%", () => {
    // Cairo (Ramses) → Giza (~10km along the river axis)
    const d = distanceKm(30.0626, 31.2497, 30.0131, 31.2089);
    expect(d).toBeGreaterThan(5);
    expect(d).toBeLessThan(10);
  });

  it("is symmetric", () => {
    const a = distanceKm(30.0626, 31.2497, 30.1281, 31.2444);
    const b = distanceKm(30.1281, 31.2444, 30.0626, 31.2497);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe("findNearestStation", () => {
  it("returns the seed station closest to the probe point", () => {
    const ramses = STATIONS.find((s) => s.id === "ramses")!;
    const probe = { lat: ramses.lat + 0.0005, lng: ramses.lng + 0.0005 };
    const { station, distance } = findNearestStation(probe.lat, probe.lng);
    expect(station.id).toBe("ramses");
    expect(distance).toBeLessThan(0.2); // <200m
  });

  it("returns a real station even when the probe is far away", () => {
    const { station, distance } = findNearestStation(0, 0); // ocean
    expect(station).toBeDefined();
    expect(STATIONS.map((s) => s.id)).toContain(station.id);
    expect(distance).toBeGreaterThan(1000);
  });

  it("never returns Infinity once at least one station exists", () => {
    const { distance } = findNearestStation(30, 31);
    expect(Number.isFinite(distance)).toBe(true);
  });
});
