import { describe, it, expect } from "vitest";
import {
  filterStationsByCountry,
  groupCitiesByRegion,
  localizedCityName,
  localizedCountryName,
  type City,
} from "./cities";

const mkCity = (over: Partial<City>): City => ({
  id: "c", slug: "c", name: "القاهرة", name_en: "Cairo",
  country_code: "EG", country_name: "مصر", country_name_en: "Egypt",
  region: "mena_north_africa", lat: 30, lng: 31, ...over,
});

describe("localizedCityName", () => {
  const cairo = mkCity({});
  it("returns Arabic for Arabic UI", () => {
    expect(localizedCityName(cairo, "ar")).toBe("القاهرة");
  });
  it("returns English when available", () => {
    expect(localizedCityName(cairo, "en")).toBe("Cairo");
  });
  it("falls back to native when English missing", () => {
    expect(localizedCityName({ ...cairo, name_en: null }, "en")).toBe("القاهرة");
  });
});

describe("localizedCountryName", () => {
  it("Arabic for ar locales", () => {
    expect(localizedCountryName(mkCity({}), "ar-EG")).toBe("مصر");
  });
  it("English for en locales", () => {
    expect(localizedCountryName(mkCity({}), "en")).toBe("Egypt");
  });
  it("blank-safe", () => {
    expect(localizedCountryName({ country_name: null, country_name_en: null }, "en")).toBe("");
  });
});

describe("filterStationsByCountry", () => {
  const stations = [
    { name: "محطة رمسيس", area: "وسط البلد", country_code: "EG" },
    { name: "Riyadh Central", area: null, country_code: "SA" },
    { name: "محطة قديمة", area: "القاهرة", country_code: null }, // legacy
    { name: "Other", area: "Elsewhere", country_code: null },
  ];
  it("authoritative match by country_code", () => {
    expect(filterStationsByCountry(stations, "SA").map((s) => s.name)).toEqual(["Riyadh Central"]);
  });
  it("falls back to city-name match for legacy stations", () => {
    const r = filterStationsByCountry(stations, "EG", "القاهرة").map((s) => s.name);
    expect(r).toContain("محطة رمسيس");
    expect(r).toContain("محطة قديمة");
    expect(r).not.toContain("Other");
  });
  it("empty country returns all", () => {
    expect(filterStationsByCountry(stations, "")).toHaveLength(4);
  });
});

describe("groupCitiesByRegion", () => {
  const cities = [
    mkCity({ id: "1", country_code: "EG", region: "mena_north_africa" }),
    mkCity({ id: "2", country_code: "SA", region: "mena_gulf" }),
    mkCity({ id: "3", country_code: "AE", region: "mena_gulf" }),
    mkCity({ id: "4", country_code: "ZZ", region: null }),
  ];
  it("buckets cities", () => {
    const g = groupCitiesByRegion(cities);
    expect(g.get("mena_gulf")).toHaveLength(2);
    expect(g.get("mena_north_africa")).toHaveLength(1);
    expect(g.get("other")).toHaveLength(1);
  });
});
