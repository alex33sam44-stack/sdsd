import { describe, expect, it } from "vitest";
import { planTrip, searchPlaces, findNearbyKnownStops } from "@/lib/planner";
import { STATIONS } from "@/data/stations";

const ramses = STATIONS.find((s) => s.id === "ramses")!;
const shubraLine = ramses.lines.find((l) => l.id === "ramses-shubra")!;
const shubraDest = shubraLine.stops[shubraLine.stops.length - 1]; // شبرا الخيمة

describe("searchPlaces (Arabic substring)", () => {
  it("returns [] for empty queries", () => {
    expect(searchPlaces("")).toEqual([]);
    expect(searchPlaces("   ")).toEqual([]);
  });

  it("matches station names", () => {
    const hits = searchPlaces("رمسيس");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.type === "station" && h.id === "ramses")).toBe(true);
  });

  it("matches stop names along a line", () => {
    const hits = searchPlaces("شبرا الخيمة");
    expect(hits.some((h) => h.type === "stop" && h.name.includes("شبرا"))).toBe(true);
  });

  it("dedupes by id+name and caps to 10", () => {
    const hits = searchPlaces("موقف");
    const ids = new Set(hits.map((h) => `${h.type}:${h.id}:${h.name}`));
    expect(ids.size).toBe(hits.length);
    expect(hits.length).toBeLessThanOrEqual(10);
  });
});

describe("planTrip — pickup/dropoff ordering & ranking", () => {
  it("dropoff comes after pickup along the line (no backwards rides)", () => {
    const results = planTrip(
      { lat: ramses.lat, lng: ramses.lng },
      { lat: shubraDest.lat, lng: shubraDest.lng }
    );
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      const pickupIdx = r.line.stops.findIndex((s) => s.id === r.pickupStop.id);
      const dropoffIdx = r.line.stops.findIndex((s) => s.id === r.dropoffStop.id);
      expect(dropoffIdx).toBeGreaterThan(pickupIdx);
    }
  });

  it("pickup is always the first stop of the line (the station itself)", () => {
    const results = planTrip(
      { lat: ramses.lat, lng: ramses.lng },
      { lat: shubraDest.lat, lng: shubraDest.lng }
    );
    for (const r of results) {
      expect(r.pickupStop.id).toBe(r.line.stops[0].id);
    }
  });

  it("ranks results by total walking distance (ascending)", () => {
    const results = planTrip(
      { lat: ramses.lat, lng: ramses.lng },
      { lat: shubraDest.lat, lng: shubraDest.lng }
    );
    for (let i = 1; i < results.length; i++) {
      expect(results[i].totalKm).toBeGreaterThanOrEqual(results[i - 1].totalKm);
    }
  });

  it("returns the direct line first when destination matches a terminal stop", () => {
    const results = planTrip(
      { lat: ramses.lat, lng: ramses.lng },
      { lat: shubraDest.lat, lng: shubraDest.lng }
    );
    expect(results[0].line.id).toBe("ramses-shubra");
    expect(results[0].isDirect).toBe(true);
    expect(results[0].labels).toContain("مباشر");
  });

  it("assigns الأقرب لموقعك to the route with smallest pickup walk", () => {
    const results = planTrip(
      { lat: ramses.lat, lng: ramses.lng },
      { lat: shubraDest.lat, lng: shubraDest.lng }
    );
    const tagged = results.find((r) => r.labels.includes("الأقرب لموقعك"))!;
    const minPickupWalk = Math.min(...results.map((r) => r.walkToPickupKm));
    expect(tagged.walkToPickupKm).toBeCloseTo(minPickupWalk, 6);
  });

  it("prefers a line with cars > 0 for أسرع اختيار when ties exist", () => {
    const results = planTrip(
      { lat: ramses.lat, lng: ramses.lng },
      { lat: shubraDest.lat, lng: shubraDest.lng }
    );
    const fastest = results.find((r) => r.labels.includes("أسرع اختيار"));
    expect(fastest).toBeDefined();
    if (results.some((r) => r.cars > 0)) {
      expect(fastest!.cars).toBeGreaterThan(0);
    }
  });

  it("returns no results when destination is far from every line", () => {
    const results = planTrip(
      { lat: ramses.lat, lng: ramses.lng },
      { lat: -33.86, lng: 151.21 } // Sydney
    );
    expect(results).toEqual([]);
  });
});

describe("findNearbyKnownStops", () => {
  it("finds known stops within the radius and orders by distance", () => {
    const items = findNearbyKnownStops({ lat: ramses.lat, lng: ramses.lng }, 3, 5);
    expect(items.length).toBeGreaterThan(0);
    for (let i = 1; i < items.length; i++) {
      expect(items[i].distanceKm).toBeGreaterThanOrEqual(items[i - 1].distanceKm);
    }
    expect(items.every((i) => i.distanceKm <= 3)).toBe(true);
  });

  it("returns [] when nothing is within the radius", () => {
    const items = findNearbyKnownStops({ lat: 0, lng: 0 }, 1, 5);
    expect(items).toEqual([]);
  });
});
