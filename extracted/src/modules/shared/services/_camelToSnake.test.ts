import { describe, expect, it } from "vitest";
import { snakify } from "@/modules/shared/services/_camelToSnake";

describe("snakify", () => {
  it("converts camelCase keys to snake_case", () => {
    expect(snakify({ stationId: "abc", isPublished: true })).toEqual({
      station_id: "abc",
      is_published: true,
    });
  });

  it("recurses into nested objects and arrays", () => {
    const input = {
      cityId: "c1",
      lines: [{ stationId: "s1", stops: [{ lineId: "l1", position: 2 }] }],
    };
    expect(snakify(input)).toEqual({
      city_id: "c1",
      lines: [{ station_id: "s1", stops: [{ line_id: "l1", position: 2 }] }],
    });
  });

  it("coerces stringified Decimals on numeric geo fields", () => {
    expect(snakify({ lat: "31.95", lng: "35.93", zoneX: "12.5" })).toEqual({
      lat: 31.95,
      lng: 35.93,
      zone_x: 12.5,
    });
  });

  it("leaves non-numeric strings, dates, and nulls intact", () => {
    expect(snakify({ name: "Acme", createdAt: "2024-01-01T00:00:00Z", area: null })).toEqual({
      name: "Acme",
      created_at: "2024-01-01T00:00:00Z",
      area: null,
    });
  });

  it("handles primitives and empty values", () => {
    expect(snakify(null)).toBeNull();
    expect(snakify(undefined)).toBeUndefined();
    expect(snakify(42)).toBe(42);
    expect(snakify([])).toEqual([]);
  });
});
