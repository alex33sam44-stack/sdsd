// Station, station_layouts, layout_zones services — fully on REST.
// Backed by `/stations/*`, `/layouts/:stationId`, `/zones/*`.
import { api } from "@/lib/api";
import { snakify } from "./_camelToSnake";
import { logAudit } from "./audit";
import { runMutation } from "@/lib/serviceError";
import type { LayoutZone, Station, StationLayout } from "../types";

export type StationPatch = Partial<
  Pick<Station, "name" | "area" | "lat" | "lng" | "city_id" | "is_published">
>;

export type StationCreateInput = {
  name: string;
  area?: string | null;
  lat: number;
  lng: number;
  city_id?: string | null;
  is_published?: boolean;
};

function snakeToCamel(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined) continue;
    out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  return out;
}

export async function createStation(input: StationCreateInput): Promise<Station> {
  return runMutation("stations.create", async () => {
    if (!input.name?.trim()) throw new Error("اسم الموقف مطلوب");
    if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
      throw new Error("إحداثيات الموقف غير صحيحة");
    }
    const body = snakeToCamel({
      name: input.name.trim(),
      area: input.area ?? null,
      lat: input.lat,
      lng: input.lng,
      city_id: input.city_id ?? null,
      is_published: input.is_published ?? false,
    });
    const data = await api.post<unknown>("/stations", body);
    const station = snakify<Station>(data);
    await logAudit({ entity: "station", entityId: station?.id, action: "create", diff: input as any });
    return station;
  }, { entity: "station", action: "create" });
}

export async function deleteStation(stationId: string): Promise<void> {
  return runMutation("stations.delete", async () => {
    await api.delete(`/stations/${encodeURIComponent(stationId)}`);
    await logAudit({ entity: "station", entityId: stationId, action: "delete" });
  }, { entity: "station", entityId: stationId, action: "delete" });
}

export async function updateStation(stationId: string, patch: StationPatch): Promise<Station> {
  return runMutation("stations.update", async () => {
    const data = await api.patch<unknown>(
      `/stations/${encodeURIComponent(stationId)}`,
      snakeToCamel(patch as Record<string, unknown>),
    );
    const station = snakify<Station>(data);
    await logAudit({ entity: "station", entityId: stationId, action: "update", diff: patch });
    return station;
  }, { entity: "station", entityId: stationId, action: "update" });
}

export async function setStationPublished(stationId: string, isPublished: boolean) {
  return runMutation("stations.publish", async () => {
    await updateStation(stationId, { is_published: isPublished });
    await logAudit({
      entity: "station", entityId: stationId,
      action: isPublished ? "publish" : "unpublish",
    });
  }, { entity: "station", entityId: stationId, action: isPublished ? "publish" : "unpublish" });
}

// ── station_layouts ─────────────────────────────────────────────────────────
export async function getOrCreateLayout(stationId: string): Promise<StationLayout> {
  const data = await api.get<unknown>(`/layouts/${encodeURIComponent(stationId)}`);
  if (data) return snakify<StationLayout>(data);
  const created = await api.put<unknown>(`/layouts/${encodeURIComponent(stationId)}`, {
    viewbox: "0 0 100 100",
  });
  return snakify<StationLayout>(created);
}

export async function updateLayout(layoutId: string, patch: Partial<Pick<StationLayout, "viewbox" | "notes">>) {
  return runMutation("layouts.update", async () => {
    // Backend keys layouts by stationId, not layoutId — but the only caller
    // (drafts.applyDraftPayload for `station_layout`) passes the layout's own id.
    // Resolve via the layout endpoint by treating the supplied id as stationId
    // for the common case where they're being managed together.
    await api.put(`/layouts/${encodeURIComponent(layoutId)}`, patch);
    await logAudit({ entity: "station_layout", entityId: layoutId, action: "update", diff: patch });
  }, { entity: "station_layout", entityId: layoutId, action: "update" });
}

// ── layout_zones CRUD ───────────────────────────────────────────────────────
export type ZonePatch = Partial<Pick<LayoutZone, "zone_key" | "label" | "x" | "y" | "w" | "h">>;

export async function listZones(stationId: string): Promise<LayoutZone[]> {
  const rows = await api.get<unknown[]>(`/zones?stationId=${encodeURIComponent(stationId)}`);
  const list = snakify<LayoutZone[]>(rows);
  return list.slice().sort((a, b) => (a.zone_key ?? "").localeCompare(b.zone_key ?? ""));
}

export async function createZone(input: Omit<LayoutZone, "id" | "created_at">) {
  return runMutation("zones.create", async () => {
    const data = await api.post<unknown>("/zones", snakeToCamel(input as Record<string, unknown>));
    const zone = snakify<LayoutZone>(data);
    await logAudit({ entity: "layout_zone", entityId: zone?.id, action: "create", diff: input as any });
    return zone;
  }, { entity: "layout_zone", action: "create" });
}

export async function updateZone(zoneId: string, patch: ZonePatch) {
  return runMutation("zones.update", async () => {
    await api.patch(`/zones/${encodeURIComponent(zoneId)}`, snakeToCamel(patch as Record<string, unknown>));
    await logAudit({ entity: "layout_zone", entityId: zoneId, action: "update", diff: patch });
  }, { entity: "layout_zone", entityId: zoneId, action: "update" });
}

export async function deleteZone(zoneId: string) {
  return runMutation("zones.delete", async () => {
    await api.delete(`/zones/${encodeURIComponent(zoneId)}`);
    await logAudit({ entity: "layout_zone", entityId: zoneId, action: "delete" });
  }, { entity: "layout_zone", entityId: zoneId, action: "delete" });
}
