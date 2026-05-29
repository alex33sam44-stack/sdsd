// Stop CRUD + reorder helpers, all audited via the backend.
// Backed by REST endpoints `/stops/*`.
import { api } from "@/lib/api";
import { snakify } from "./_camelToSnake";
import { logAudit } from "./audit";
import { runMutation } from "@/lib/serviceError";
import type { RouteStop } from "../types";

export type StopInput = {
  name: string;
  lat: number;
  lng: number;
  keywords?: string[];
};

export async function listStops(lineId: string): Promise<RouteStop[]> {
  const rows = await api.get<unknown[]>(`/stops?lineId=${encodeURIComponent(lineId)}`);
  const list = snakify<RouteStop[]>(rows);
  return list.slice().sort((a, b) => a.position - b.position);
}

export async function createStop(lineId: string, input: StopInput): Promise<RouteStop> {
  return runMutation("stops.create", async () => {
    const existing = await api.get<unknown[]>(`/stops?lineId=${encodeURIComponent(lineId)}`);
    const position = (existing?.length ?? 0) + 1;
    const data = await api.post<unknown>("/stops", {
      lineId, position,
      name: input.name, lat: input.lat, lng: input.lng,
      keywords: input.keywords ?? [],
    });
    const stop = snakify<RouteStop>(data);
    await logAudit({ entity: "route_stop", entityId: stop?.id, action: "create", diff: input as any });
    return stop;
  }, { entity: "route_stop", action: "create" });
}

export async function updateStop(stopId: string, patch: Partial<StopInput>): Promise<void> {
  return runMutation("stops.update", async () => {
    await api.patch(`/stops/${encodeURIComponent(stopId)}`, patch);
    await logAudit({ entity: "route_stop", entityId: stopId, action: "update", diff: patch as any });
  }, { entity: "route_stop", entityId: stopId, action: "update" });
}

export async function deleteStop(stopId: string): Promise<void> {
  return runMutation("stops.delete", async () => {
    await api.delete(`/stops/${encodeURIComponent(stopId)}`);
    await logAudit({ entity: "route_stop", entityId: stopId, action: "delete" });
  }, { entity: "route_stop", entityId: stopId, action: "delete" });
}

export async function reorderStops(lineId: string, orderedIds: string[]): Promise<void> {
  return runMutation("stops.reorder", async () => {
    await api.post(`/stops/reorder`, { lineId, orderedIds });
    await logAudit({
      entity: "route_stops", entityId: lineId, action: "reorder",
      diff: { count: orderedIds.length },
    });
  }, { entity: "route_stops", entityId: lineId, action: "reorder" });
}
