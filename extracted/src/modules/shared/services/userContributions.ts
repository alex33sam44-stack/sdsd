import type { VehicleType } from "@/data/stations";

const CONTRIBUTIONS_KEY = "mwasalat.userContributions.v1";
const MAX_ITEMS = 250;

export type ContributionStatus = "pending_review";

export type StationLineContribution = {
  id: string;
  type: "station_line";
  status: ContributionStatus;
  submittedAt: string;
  stationId: string;
  stationName: string;
  destination: string;
  pickupArea: string;
  vehicleType: VehicleType;
  notes: string | null;
  contact: string | null;
};

export type RouteFeatureKind =
  | "pickup"
  | "dropoff"
  | "landmark"
  | "crowding"
  | "safety"
  | "comfort"
  | "accessibility"
  | "other";

export type RouteFeatureContribution = {
  id: string;
  type: "route_feature";
  status: ContributionStatus;
  submittedAt: string;
  stationId: string;
  stationName: string;
  lineId: string;
  lineDestination: string;
  kind: RouteFeatureKind;
  title: string;
  stopName: string | null;
  notes: string | null;
  contact: string | null;
};

export type UserContribution = StationLineContribution | RouteFeatureContribution;

function safeId(prefix: string) {
  const cryptoObj = typeof crypto !== "undefined" ? crypto : null;
  if (cryptoObj?.randomUUID) return `${prefix}-${cryptoObj.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readAll(): UserContribution[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(CONTRIBUTIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) as UserContribution[] : [];
  } catch {
    return [];
  }
}

function writeAll(items: UserContribution[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CONTRIBUTIONS_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    // Storage may be unavailable in private mode; the caller still gets a safe result.
  }
}

export function listUserContributions(): UserContribution[] {
  return readAll();
}

export function listStationLineContributions(stationId: string): StationLineContribution[] {
  return readAll().filter(
    (item): item is StationLineContribution => item.type === "station_line" && item.stationId === stationId,
  );
}

export function listRouteFeatureContributions(lineId: string): RouteFeatureContribution[] {
  return readAll().filter(
    (item): item is RouteFeatureContribution => item.type === "route_feature" && item.lineId === lineId,
  );
}

export function addStationLineContribution(input: Omit<StationLineContribution, "id" | "type" | "status" | "submittedAt">) {
  const item: StationLineContribution = {
    ...input,
    id: safeId("station-line"),
    type: "station_line",
    status: "pending_review",
    submittedAt: new Date().toISOString(),
  };
  writeAll([item, ...readAll()]);
  window.dispatchEvent(new CustomEvent("mwasalat:user-contributions-changed"));
  return item;
}

export function addRouteFeatureContribution(input: Omit<RouteFeatureContribution, "id" | "type" | "status" | "submittedAt">) {
  const item: RouteFeatureContribution = {
    ...input,
    id: safeId("route-feature"),
    type: "route_feature",
    status: "pending_review",
    submittedAt: new Date().toISOString(),
  };
  writeAll([item, ...readAll()]);
  window.dispatchEvent(new CustomEvent("mwasalat:user-contributions-changed"));
  return item;
}
