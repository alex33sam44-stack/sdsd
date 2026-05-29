// Adapter: backend REST payloads -> legacy Station/TaxiLine shape used across
// passenger UI. Keeps existing components unchanged while the UI is gradually
// typed against the new domain model.
import type { Station as LegacyStation, TaxiLine, VehicleType, Stop } from "@/data/stations";
import type { LineWithStops, Station, StationWithLines } from "../types";

const VALID_VTYPES: VehicleType[] = ["ميكروباص", "أتوبيس", "ميني باص", "تاكسي موقف"];
const normalizeVtype = (v: string | null | undefined): VehicleType =>
  (VALID_VTYPES as string[]).includes(v ?? "") ? (v as VehicleType) : "ميكروباص";

export function adaptLine(l: LineWithStops): TaxiLine {
  return {
    id: l.id,
    destination: l.destination,
    color: l.color || "#FFC800",
    cars: l.cars ?? 0,
    updatedAt: l.cars_updated_at ?? l.updated_at ?? new Date().toISOString(),
    pickupArea: l.pickup_area ?? "",
    vehicleType: normalizeVtype(l.vehicle_type as any),
    zone: {
      x: Number(l.zone_x ?? 10),
      y: Number(l.zone_y ?? 10),
      w: Number(l.zone_w ?? 30),
      h: Number(l.zone_h ?? 15),
    },
    stops: (l.stops ?? []).map<Stop>((s) => ({
      id: s.id,
      name: s.name,
      lat: Number(s.lat),
      lng: Number(s.lng),
    })),
  };
}

export function adaptStation(s: StationWithLines): LegacyStation {
  return {
    id: s.id,
    name: s.name,
    area: s.area ?? "",
    lat: Number(s.lat),
    lng: Number(s.lng),
    lines: (s.lines ?? []).map(adaptLine),
  };
}

export function adaptStationLite(s: Station): Omit<LegacyStation, "lines"> & { lines: TaxiLine[] } {
  return {
    id: s.id,
    name: s.name,
    area: s.area ?? "",
    lat: Number(s.lat),
    lng: Number(s.lng),
    lines: [],
  };
}
