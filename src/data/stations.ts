export type Stop = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

/**
 * @deprecated Legacy seed data — used ONLY by:
 *   - `src/lib/planner.ts` as a fallback when the backend is unreachable
 *   - `src/modules/shared/services/legacyMigration.ts` for one-time data import
 *
 * This file is NOT the source of truth for production. In production mode the
 * app reads exclusively from the NestJS REST API → MySQL. The data here was
 * originally hand-collected from field visits (no GTFS affiliation).
 *
 * Provenance: manual field observation, Cairo, Egypt, circa 2024-2025.
 * Accuracy: approximate (coordinates rounded to ~10m; car counts are
 * illustrative snapshots, not live feeds).
 *
 * See `docs/DATA_PROVENANCE.md` for the full provenance system.
 */

export type VehicleType = "ميكروباص" | "أتوبيس" | "ميني باص" | "تاكسي موقف";

export type TaxiLine = {
  id: string;
  destination: string;
  color: string; // hex for SVG
  cars: number;
  updatedAt: string; // ISO
  pickupArea: string;
  vehicleType?: VehicleType;
  // Position on the station SVG (0-100 percentage based)
  zone: { x: number; y: number; w: number; h: number };
  stops: Stop[];
};

export type Station = {
  id: string;
  name: string;
  area: string;
  lat: number;
  lng: number;
  lines: TaxiLine[];
};

export const STATIONS: Station[] = [
  {
    id: "ramses",
    name: "موقف رمسيس",
    area: "وسط القاهرة",
    lat: 30.0626,
    lng: 31.2497,
    lines: [
      {
        id: "ramses-shubra",
        destination: "شبرا الخيمة",
        color: "#FFC800",
        cars: 6,
        updatedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
        pickupArea: "الرصيف الشمالي - بجوار البوابة الرئيسية",
        vehicleType: "ميكروباص",
        zone: { x: 8, y: 15, w: 38, h: 18 },
        stops: [
          { id: "s1", name: "موقف رمسيس", lat: 30.0626, lng: 31.2497 },
          { id: "s2", name: "كوبري الليمون", lat: 30.0712, lng: 31.2456 },
          { id: "s3", name: "روض الفرج", lat: 30.0832, lng: 31.2426 },
          { id: "s4", name: "شبرا الخيمة", lat: 30.1281, lng: 31.2444 },
        ],
      },
      {
        id: "ramses-helio",
        destination: "مصر الجديدة",
        color: "#2563EB",
        cars: 3,
        updatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
        pickupArea: "الرصيف الشرقي - أمام الكشك",
        vehicleType: "أتوبيس",
        zone: { x: 54, y: 15, w: 38, h: 18 },
        stops: [
          { id: "h1", name: "موقف رمسيس", lat: 30.0626, lng: 31.2497 },
          { id: "h2", name: "العباسية", lat: 30.0735, lng: 31.2755 },
          { id: "h3", name: "ميدان الجيش", lat: 30.0792, lng: 31.2799 },
          { id: "h4", name: "ميدان الحجاز", lat: 30.0985, lng: 31.3306 },
        ],
      },
      {
        id: "ramses-maadi",
        destination: "المعادي",
        color: "#16A34A",
        cars: 8,
        updatedAt: new Date(Date.now() - 1 * 60_000).toISOString(),
        pickupArea: "الرصيف الجنوبي - بجوار محل العصير",
        vehicleType: "ميكروباص",
        zone: { x: 8, y: 55, w: 38, h: 18 },
        stops: [
          { id: "m1", name: "موقف رمسيس", lat: 30.0626, lng: 31.2497 },
          { id: "m2", name: "السيدة زينب", lat: 30.0322, lng: 31.2367 },
          { id: "m3", name: "كورنيش المعادي", lat: 29.9603, lng: 31.2569 },
          { id: "m4", name: "المعادي - محطة المترو", lat: 29.9602, lng: 31.2575 },
        ],
      },
      {
        id: "ramses-nasrcity",
        destination: "مدينة نصر",
        color: "#DC2626",
        cars: 0,
        updatedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
        pickupArea: "الرصيف الجنوبي الشرقي",
        vehicleType: "ميني باص",
        zone: { x: 54, y: 55, w: 38, h: 18 },
        stops: [
          { id: "n1", name: "موقف رمسيس", lat: 30.0626, lng: 31.2497 },
          { id: "n2", name: "ميدان الجيش", lat: 30.0792, lng: 31.2799 },
          { id: "n3", name: "ميدان رابعة", lat: 30.0683, lng: 31.3306 },
          { id: "n4", name: "السبعة عمارات", lat: 30.0571, lng: 31.3470 },
        ],
      },
    ],
  },
  {
    id: "tahrir",
    name: "موقف التحرير",
    area: "وسط البلد",
    lat: 30.0444,
    lng: 31.2357,
    lines: [
      {
        id: "tahrir-giza",
        destination: "ميدان الجيزة",
        color: "#FFC800",
        cars: 4,
        updatedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
        pickupArea: "بجوار المتحف المصري",
        vehicleType: "ميكروباص",
        zone: { x: 8, y: 15, w: 38, h: 18 },
        stops: [
          { id: "g1", name: "موقف التحرير", lat: 30.0444, lng: 31.2357 },
          { id: "g2", name: "كوبري قصر النيل", lat: 30.0428, lng: 31.2275 },
          { id: "g3", name: "الدقي", lat: 30.0383, lng: 31.2125 },
          { id: "g4", name: "ميدان الجيزة", lat: 30.0103, lng: 31.2089 },
        ],
      },
      {
        id: "tahrir-mohandessin",
        destination: "المهندسين",
        color: "#2563EB",
        cars: 5,
        updatedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
        pickupArea: "خلف مجمع التحرير",
        vehicleType: "أتوبيس",
        zone: { x: 54, y: 15, w: 38, h: 18 },
        stops: [
          { id: "mo1", name: "موقف التحرير", lat: 30.0444, lng: 31.2357 },
          { id: "mo2", name: "الزمالك", lat: 30.0608, lng: 31.2200 },
          { id: "mo3", name: "ميدان لبنان", lat: 30.0606, lng: 31.2061 },
          { id: "mo4", name: "ميدان سفنكس", lat: 30.0640, lng: 31.2089 },
        ],
      },
      {
        id: "tahrir-helwan",
        destination: "حلوان",
        color: "#16A34A",
        cars: 2,
        updatedAt: new Date(Date.now() - 8 * 60_000).toISOString(),
        pickupArea: "الرصيف المقابل للمتحف",
        vehicleType: "ميكروباص",
        zone: { x: 30, y: 55, w: 40, h: 18 },
        stops: [
          { id: "he1", name: "موقف التحرير", lat: 30.0444, lng: 31.2357 },
          { id: "he2", name: "السيدة زينب", lat: 30.0322, lng: 31.2367 },
          { id: "he3", name: "المعادي", lat: 29.9602, lng: 31.2575 },
          { id: "he4", name: "حلوان", lat: 29.8487, lng: 31.3340 },
        ],
      },
    ],
  },
  {
    id: "alex-mahatta",
    name: "موقف محطة مصر",
    area: "الإسكندرية",
    lat: 31.1936,
    lng: 29.9050,
    lines: [
      {
        id: "alex-mansheya",
        destination: "المنشية",
        color: "#FFC800",
        cars: 7,
        updatedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
        pickupArea: "بجوار محطة القطار",
        vehicleType: "ميكروباص",
        zone: { x: 8, y: 15, w: 38, h: 18 },
        stops: [
          { id: "a1", name: "محطة مصر", lat: 31.1936, lng: 29.9050 },
          { id: "a2", name: "محرم بك", lat: 31.1942, lng: 29.9145 },
          { id: "a3", name: "المنشية", lat: 31.1965, lng: 29.8961 },
        ],
      },
      {
        id: "alex-montaza",
        destination: "المنتزه",
        color: "#2563EB",
        cars: 3,
        updatedAt: new Date(Date.now() - 6 * 60_000).toISOString(),
        pickupArea: "الرصيف البحري",
        vehicleType: "أتوبيس",
        zone: { x: 54, y: 15, w: 38, h: 18 },
        stops: [
          { id: "mz1", name: "محطة مصر", lat: 31.1936, lng: 29.9050 },
          { id: "mz2", name: "سيدي جابر", lat: 31.2185, lng: 29.9436 },
          { id: "mz3", name: "ميامي", lat: 31.2670, lng: 30.0021 },
          { id: "mz4", name: "المنتزه", lat: 31.2885, lng: 30.0211 },
        ],
      },
    ],
  },
];

export function getStation(id: string): Station | undefined {
  return STATIONS.find((s) => s.id === id);
}

// Haversine distance in km
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function findNearestStation(lat: number, lng: number): { station: Station; distance: number } {
  let best = { station: STATIONS[0], distance: Infinity };
  for (const s of STATIONS) {
    const d = distanceKm(lat, lng, s.lat, s.lng);
    if (d < best.distance) best = { station: s, distance: d };
  }
  return best;
}
