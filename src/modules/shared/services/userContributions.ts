import type { VehicleType } from "@/data/stations";
import { api } from "@/lib/api";

const CONTRIBUTIONS_KEY = "mwasalat.userContributions.v1";
const MAX_ITEMS = 250;

/**
 * Status mirrors the backend `UserContributionStatus` enum. The UI today only
 * filters on `type`, so widening this string union does not affect any caller
 * and lets moderators reflect their decision back into the local cache.
 */
export type ContributionStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "applied";

/**
 * Local-only metadata that tracks whether a contribution has been mirrored to
 * the backend. The fields are optional so older cached payloads remain
 * forwards-compatible.
 */
export type LocalSyncState =
  | "pending_sync"
  | "synced"
  | "sync_failed"
  | "no_backend";

interface LocalSyncMeta {
  _syncState?: LocalSyncState;
  _serverId?: string | null;
  _lastSyncError?: string | null;
}

export type StationLineContribution = LocalSyncMeta & {
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

export type RouteFeatureContribution = LocalSyncMeta & {
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

/** Server-shaped record returned by GET /contributions for moderators. */
export interface ServerContributionRecord {
  id: string;
  tenantId: string | null;
  submittedById: string | null;
  type: "station_line" | "route_feature";
  status: ContributionStatus;
  stationId: string | null;
  stationName: string | null;
  lineId: string | null;
  payload: Record<string, unknown>;
  reviewerId: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const CHANGE_EVENT = "mwasalat:user-contributions-changed";

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
    return Array.isArray(parsed) ? (parsed.filter(Boolean) as UserContribution[]) : [];
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

function notifyChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
}

function patchLocal(id: string, patch: Partial<UserContribution>) {
  const items = readAll();
  const idx = items.findIndex((x) => x.id === id);
  if (idx === -1) return;
  items[idx] = { ...items[idx], ...patch } as UserContribution;
  writeAll(items);
  notifyChanged();
}

function buildBackendBody(item: UserContribution) {
  if (item.type === "station_line") {
    return {
      type: "station_line" as const,
      stationId: item.stationId,
      stationName: item.stationName,
      destination: item.destination,
      pickupArea: item.pickupArea,
      vehicleType: item.vehicleType,
      notes: item.notes,
      contact: item.contact,
      clientId: item.id,
      submittedAt: item.submittedAt,
    };
  }
  return {
    type: "route_feature" as const,
    stationId: item.stationId,
    stationName: item.stationName,
    lineId: item.lineId,
    lineDestination: item.lineDestination,
    kind: item.kind,
    title: item.title,
    stopName: item.stopName,
    notes: item.notes,
    contact: item.contact,
    clientId: item.id,
    submittedAt: item.submittedAt,
  };
}

async function syncOne(item: UserContribution): Promise<void> {
  if (!api.baseUrl) {
    patchLocal(item.id, { _syncState: "no_backend" });
    return;
  }
  try {
    const saved = await api.post<ServerContributionRecord>(
      "/contributions",
      buildBackendBody(item),
    );
    patchLocal(item.id, {
      _syncState: "synced",
      _serverId: saved.id,
      _lastSyncError: null,
      status: saved.status,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "sync_failed";
    console.warn("[userContributions] backend sync failed", err);
    patchLocal(item.id, { _syncState: "sync_failed", _lastSyncError: message });
  }
}

/**
 * Re-tries every locally cached contribution that has not yet been confirmed
 * by the backend. Safe to call on app boot, after sign-in, or on reconnection.
 * Resolves to the number of items that were successfully synced.
 */
export async function retryPendingContributions(): Promise<number> {
  if (!api.baseUrl) return 0;
  const items = readAll();
  const stale = items.filter((item) => item._syncState !== "synced");
  let synced = 0;
  for (const item of stale) {
    const before = readAll().find((x) => x.id === item.id);
    await syncOne(item);
    const after = readAll().find((x) => x.id === item.id);
    if (before?._syncState !== "synced" && after?._syncState === "synced") {
      synced += 1;
    }
  }
  return synced;
}

export function listUserContributions(): UserContribution[] {
  return readAll();
}

export function listStationLineContributions(stationId: string): StationLineContribution[] {
  return readAll().filter(
    (item): item is StationLineContribution =>
      item.type === "station_line" && item.stationId === stationId,
  );
}

export function listRouteFeatureContributions(lineId: string): RouteFeatureContribution[] {
  return readAll().filter(
    (item): item is RouteFeatureContribution =>
      item.type === "route_feature" && item.lineId === lineId,
  );
}

export function addStationLineContribution(
  input: Omit<StationLineContribution, "id" | "type" | "status" | "submittedAt" | keyof LocalSyncMeta>,
): StationLineContribution {
  const item: StationLineContribution = {
    ...input,
    id: safeId("station-line"),
    type: "station_line",
    status: "pending_review",
    submittedAt: new Date().toISOString(),
    _syncState: "pending_sync",
  };
  writeAll([item, ...readAll()]);
  notifyChanged();
  void syncOne(item);
  return item;
}

export function addRouteFeatureContribution(
  input: Omit<RouteFeatureContribution, "id" | "type" | "status" | "submittedAt" | keyof LocalSyncMeta>,
): RouteFeatureContribution {
  const item: RouteFeatureContribution = {
    ...input,
    id: safeId("route-feature"),
    type: "route_feature",
    status: "pending_review",
    submittedAt: new Date().toISOString(),
    _syncState: "pending_sync",
  };
  writeAll([item, ...readAll()]);
  notifyChanged();
  void syncOne(item);
  return item;
}

/**
 * Moderator-only: fetch the authoritative list straight from the backend.
 * Used by the admin moderation UI; not consumed by the public hook so it
 * cannot accidentally leak other users' submissions to anonymous visitors.
 */
export async function fetchModeratedContributions(params: {
  status?: ContributionStatus;
  type?: "station_line" | "route_feature";
  stationId?: string;
  lineId?: string;
} = {}): Promise<ServerContributionRecord[]> {
  if (!api.baseUrl) return [];
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.type) search.set("type", params.type);
  if (params.stationId) search.set("stationId", params.stationId);
  if (params.lineId) search.set("lineId", params.lineId);
  const qs = search.toString();
  return api.get<ServerContributionRecord[]>(`/contributions${qs ? `?${qs}` : ""}`);
}

/** Moderator-only status update. */
export async function updateContributionStatus(
  id: string,
  status: ContributionStatus,
  reviewNote?: string | null,
): Promise<ServerContributionRecord> {
  return api.patch<ServerContributionRecord>(`/contributions/${id}/status`, {
    status,
    reviewNote: reviewNote ?? null,
  });
}
