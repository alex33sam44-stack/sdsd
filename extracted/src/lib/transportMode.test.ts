import { describe, it, expect } from "vitest";
import { deriveTransportMode, modeRankBoost, isFormal } from "./transportMode";

describe("deriveTransportMode", () => {
  it("uses explicit transport_mode when valid", () => {
    expect(deriveTransportMode({ transport_mode: "bus" })).toBe("bus");
    expect(deriveTransportMode({ transport_mode: "COMMUNITY" })).toBe("community");
  });

  it("falls back to Arabic vehicle_type when transport_mode missing", () => {
    expect(deriveTransportMode({ vehicle_type: "أتوبيس" })).toBe("bus");
    expect(deriveTransportMode({ vehicleType: "ميكروباص" })).toBe("microbus");
    expect(deriveTransportMode({ vehicleType: "ميني باص" })).toBe("minibus");
    expect(deriveTransportMode({ vehicle_type: "تاكسي موقف" })).toBe("station_taxi");
  });

  it("defaults to microbus for unknown input", () => {
    expect(deriveTransportMode({})).toBe("microbus");
    expect(deriveTransportMode({ vehicle_type: "spaceship" })).toBe("microbus");
  });
});

describe("isFormal", () => {
  it("only bus is formal", () => {
    expect(isFormal("bus")).toBe(true);
    expect(isFormal("microbus")).toBe(false);
    expect(isFormal("community")).toBe(false);
  });
});

describe("modeRankBoost", () => {
  it("favors formal bus and penalizes community", () => {
    expect(modeRankBoost("bus")).toBeGreaterThan(modeRankBoost("microbus"));
    expect(modeRankBoost("community")).toBeLessThan(0);
  });
});
