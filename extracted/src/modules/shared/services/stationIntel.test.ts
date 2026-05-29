import { describe, it, expect } from "vitest";
import { computeStationIntel, deriveBayStatus, type IntelLine, type IntelZone } from "./stationIntel";

const NOW = new Date("2026-04-28T12:00:00Z").getTime();
const min = (m: number) => new Date(NOW - m * 60_000).toISOString();

function lines(): IntelLine[] {
  return [
    { id: "l1", destination: "المعادي", pickup_area: "A", status: "crowded", cars: 8, cars_updated_at: min(2),
      zone_x: 5, zone_y: 5, zone_w: 20, zone_h: 10, is_published: true },
    { id: "l2", destination: "حلوان",   pickup_area: "A", status: "crowded", cars: 6, cars_updated_at: min(5),
      zone_x: 5, zone_y: 18, zone_w: 20, zone_h: 10, is_published: true },
    { id: "l3", destination: "الجيزة",  pickup_area: "B", status: "active",  cars: 0, cars_updated_at: min(120),
      zone_x: 70, zone_y: 70, zone_w: 20, zone_h: 10, is_published: true },
    { id: "l4", destination: "إمبابة",  pickup_area: "C", status: "stopped", cars: 0, cars_updated_at: min(20),
      zone_x: 40, zone_y: 40, zone_w: 15, zone_h: 10, is_published: true },
    // unpublished — must be ignored
    { id: "l5", destination: "draft",   pickup_area: "A", status: "active",  cars: 99, cars_updated_at: min(1),
      zone_x: 0, zone_y: 0, zone_w: 0, zone_h: 0, is_published: false },
  ];
}

function zones(): IntelZone[] {
  return [
    { id: "z-a", zone_key: "A", label: "رصيف 1", x: 5,  y: 5,  w: 20, h: 25 },
    { id: "z-b", zone_key: "B", label: "رصيف 2", x: 70, y: 70, w: 20, h: 10 },
    { id: "z-c", zone_key: "C", label: "رصيف 3", x: 40, y: 40, w: 15, h: 10 },
    { id: "z-d", zone_key: "D", label: "رصيف فارغ", x: 8, y: 32, w: 18, h: 10 }, // empty
  ];
}

describe("deriveBayStatus", () => {
  it("returns unassigned for empty bay", () => {
    expect(deriveBayStatus({ linesCount: 0, activeLines: 0, crowdedLines: 0, stoppedLines: 0, totalCars: 0, staleLines: 0 })).toBe("unassigned");
  });
  it("returns crowded when majority crowded", () => {
    expect(deriveBayStatus({ linesCount: 2, activeLines: 0, crowdedLines: 2, stoppedLines: 0, totalCars: 10, staleLines: 0 })).toBe("crowded");
  });
  it("returns idle when zero cars", () => {
    expect(deriveBayStatus({ linesCount: 1, activeLines: 1, crowdedLines: 0, stoppedLines: 0, totalCars: 0, staleLines: 0 })).toBe("idle");
  });
  it("returns inactive when no active lines", () => {
    expect(deriveBayStatus({ linesCount: 1, activeLines: 0, crowdedLines: 0, stoppedLines: 1, totalCars: 0, staleLines: 0 })).toBe("inactive");
  });
});

describe("computeStationIntel", () => {
  it("aggregates per-bay metrics from published lines only", () => {
    const out = computeStationIntel(lines(), zones(), NOW);
    const bayA = out.bays.find((b) => b.bayKey === "A")!;
    expect(bayA.linesCount).toBe(2);
    expect(bayA.totalCars).toBe(14);
    expect(bayA.crowdedLines).toBe(2);
    expect(bayA.status).toBe("crowded");
    // Empty zone D should appear as unassigned
    const bayD = out.bays.find((b) => b.bayKey === "D");
    expect(bayD?.status).toBe("unassigned");
  });

  it("ignores unpublished lines", () => {
    const out = computeStationIntel(lines(), zones(), NOW);
    expect(out.totals.publishedLines).toBe(4);
    const bayA = out.bays.find((b) => b.bayKey === "A")!;
    expect(bayA.lineIds.includes("l5")).toBe(false);
  });

  it("derives congestion level from car density + crowded ratio", () => {
    const out = computeStationIntel(lines(), zones(), NOW);
    expect(out.congestionScore).toBeGreaterThan(0);
    expect(["calm", "busy", "saturated"]).toContain(out.congestionLevel);
  });

  it("computes complexity from lines+bays+spread", () => {
    const out = computeStationIntel(lines(), zones(), NOW);
    expect(out.complexityScore).toBeGreaterThan(0);
    expect(["simple", "moderate", "complex"]).toContain(out.complexityLevel);
  });

  it("emits reassignment hints when crowded bay has nearby idle bay", () => {
    const out = computeStationIntel(lines(), zones(), NOW);
    // Bay A is crowded and Bay D (empty) is right below it (~32 vs 5..30 → close)
    const fromA = out.reassignmentHints.find((h) => h.fromBayKey === "A");
    expect(fromA).toBeDefined();
  });

  it("emits zeroCars hint for active bay with 0 cars", () => {
    const out = computeStationIntel(lines(), zones(), NOW);
    const zc = out.reassignmentHints.find((h) => h.reasonKey === "bay.reassign.zeroCars" && h.fromBayKey === "B");
    expect(zc).toBeDefined();
  });
});
