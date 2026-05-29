// Admin mutations for the `lines` table and the draft/review flow.
// Backed by REST endpoints `/lines/*` and `/drafts/*`. Every write also records
// a frontend audit log entry (server inserts via /audit), preserving the
// previous behavior 1:1.
import { api } from "@/lib/api";
import { logAudit } from "./audit";
import { snakify } from "./_camelToSnake";
import { runMutation, runService } from "@/lib/serviceError";
import type { DraftChange, Line, RouteStop } from "../types";
import {
  assertLineStatus,
  isVehicleType,
  toBackendLineStatus,
  toBackendVehicleType,
  type LineStatusValue,
} from "./enums";

export type LinePatch = Partial<
  Pick<
    Line,
    | "destination" | "color" | "vehicle_type" | "status" | "cars" | "pickup_area"
    | "zone_x" | "zone_y" | "zone_w" | "zone_h" | "is_published"
  >
>;

/** Convert snake_case admin patches to the camelCase shape Prisma expects. */
function toCamelPatch(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = v;
  }
  return out;
}

function sanitizeLinePatch(patch: LinePatch): LinePatch {
  const out: LinePatch = { ...patch };
  if (out.status !== undefined) {
    out.status = assertLineStatus(out.status, "lines.status") as LineStatusValue;
  }
  if (out.vehicle_type !== undefined && !isVehicleType(out.vehicle_type)) {
    throw new Error(`قيمة غير صالحة لنوع المركبة: ${JSON.stringify(out.vehicle_type)}`);
  }
  if (out.cars !== undefined) {
    const n = Math.floor(Number(out.cars));
    if (!Number.isFinite(n) || n < 0) throw new Error("عدد العربيات يجب أن يكون رقم موجب");
    out.cars = Math.min(99, Math.max(0, n));
  }
  return out;
}

export type LineCreateInput = {
  station_id: string;
  destination: string;
  color?: string;
  vehicle_type?: Line["vehicle_type"];
  status?: LineStatusValue;
  cars?: number;
  pickup_area?: string | null;
  is_published?: boolean;
};

export async function createLine(input: LineCreateInput): Promise<Line> {
  return runMutation("lines.create", async () => {
    if (!input.station_id) throw new Error("الموقف مطلوب");
    if (!input.destination?.trim()) throw new Error("الوجهة مطلوبة");
    const safe = sanitizeLinePatch({
      status: input.status, vehicle_type: input.vehicle_type, cars: input.cars,
    } as LinePatch);
    const row = {
      stationId: input.station_id,
      destination: input.destination.trim(),
      color: input.color ?? "#FFC800",
      vehicleType: toBackendVehicleType(safe.vehicle_type ?? input.vehicle_type ?? "ميكروباص") ?? "microbus",
      status: toBackendLineStatus(safe.status ?? "active") ?? "active",
      cars: safe.cars ?? 0,
      pickupArea: input.pickup_area ?? null,
      isPublished: input.is_published ?? false,
    };
    const data = await api.post<unknown>("/lines", row);
    const line = snakify<Line>(data);
    await logAudit({ entity: "line", entityId: line?.id, action: "create", diff: row as any });
    return line;
  }, { entity: "line", action: "create" });
}

export async function deleteLine(lineId: string): Promise<void> {
  return runMutation("lines.delete", async () => {
    await api.delete(`/lines/${encodeURIComponent(lineId)}`);
    await logAudit({ entity: "line", entityId: lineId, action: "delete" });
  }, { entity: "line", entityId: lineId, action: "delete" });
}

export async function updateLine(lineId: string, patch: LinePatch): Promise<Line> {
  return runMutation("lines.update", async () => {
    const safePatch = sanitizeLinePatch(patch);
    const carsTouched = safePatch.cars !== undefined || safePatch.status !== undefined;

    // For cars/status changes, prefer the dedicated availability endpoint so
    // the backend writes both the line and an availability_log atomically.
    if (carsTouched && safePatch.cars !== undefined && safePatch.status !== undefined) {
      const data = await api.post<unknown>(`/lines/${encodeURIComponent(lineId)}/availability`, {
        cars: safePatch.cars, status: toBackendLineStatus(safePatch.status) ?? "active",
      });
      const line = snakify<Line>(data);
      await logAudit({ entity: "line", entityId: lineId, action: "update", diff: safePatch as any });
      // Apply any non-cars fields too (destination, color, zone_*, …).
      const rest = { ...safePatch };
      delete (rest as any).cars;
      delete (rest as any).status;
      if (Object.keys(rest).length) await api.patch(`/lines/${encodeURIComponent(lineId)}`, toCamelPatch(rest as any));
      return line;
    }

    const data = await api.patch<unknown>(
`/lines/${encodeURIComponent(lineId)}`,
      toCamelPatch({
        ...safePatch,
        status: safePatch.status !== undefined ? toBackendLineStatus(safePatch.status) : undefined,
        vehicle_type: safePatch.vehicle_type !== undefined ? toBackendVehicleType(safePatch.vehicle_type) : undefined,
      } as any),
    );
    const line = snakify<Line>(data);
    await logAudit({ entity: "line", entityId: lineId, action: "update", diff: safePatch as any });
    return line;
  }, { entity: "line", entityId: lineId, action: "update" });
}

export async function setLinePublished(lineId: string, isPublished: boolean): Promise<void> {
  return runMutation("lines.publish", async () => {
    await api.patch(`/lines/${encodeURIComponent(lineId)}`, { isPublished });
    await logAudit({
      entity: "line", entityId: lineId,
      action: isPublished ? "publish" : "unpublish",
    });
  }, { entity: "line", entityId: lineId, action: isPublished ? "publish" : "unpublish" });
}

export async function replaceStops(
  lineId: string,
  stops: Array<{ name: string; lat: number; lng: number; keywords?: string[] }>
): Promise<RouteStop[]> {
  return runMutation("lines.replaceStops", async () => {
    // Backend has no bulk-replace endpoint — list, delete each, create each, reorder.
    const existing = await api.get<Array<{ id: string }>>(`/stops?lineId=${encodeURIComponent(lineId)}`);
    for (const s of existing ?? []) {
      await api.delete(`/stops/${encodeURIComponent(s.id)}`);
    }
    const created: RouteStop[] = [];
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      const data = await api.post<unknown>("/stops", {
        lineId, position: i + 1, name: s.name, lat: s.lat, lng: s.lng, keywords: s.keywords ?? [],
      });
      created.push(snakify<RouteStop>(data));
    }
    await logAudit({
      entity: "route_stops", entityId: lineId, action: "replace",
      diff: { count: created.length },
    });
    return created;
  }, { entity: "route_stops", entityId: lineId, action: "replace" });
}



export async function listAdminLinesByStation(stationId: string): Promise<LineWithStops[]> {
  return runService("lines.listAdmin", async () => {
    const rows = await api.get<unknown[]>(`/lines/admin?stationId=${encodeURIComponent(stationId)}`);
    const list = snakify<LineWithStops[]>(rows);
    return list.map((line) => ({
      ...line,
      stops: (line.stops ?? []).slice().sort((a, b) => a.position - b.position),
    }));
  });
}

// ── Draft / review / publish flow ─────────────────────────────────────────────
export type DraftEntity = "line" | "station" | "route_stop" | "layout_zone" | "station_layout";

export async function proposeDraft(input: {
  entity: DraftEntity;
  entityId?: string | null;
  patch: Record<string, unknown>;
  note?: string;
}): Promise<void> {
  return runMutation("drafts.propose", async () => {
    await api.post("/drafts", {
      entity: input.entity,
      entityId: input.entityId ?? undefined,
      patch: input.patch,
      note: input.note ?? undefined,
    });
    await logAudit({
      entity: "draft_changes", entityId: input.entityId ?? undefined,
      action: "propose", diff: input.patch,
    });
  }, { entity: "draft_changes", entityId: input.entityId, action: "propose" });
}

export async function listPendingDrafts(): Promise<DraftChange[]> {
  return runService("drafts.listPending", async () => {
    const rows = await api.get<unknown[]>("/drafts?status=pending");
    return snakify<DraftChange[]>(rows);
  });
}

export async function listAllDrafts(_limit = 200): Promise<DraftChange[]> {
  return runService("drafts.listAll", async () => {
    const rows = await api.get<unknown[]>("/drafts");
    return snakify<DraftChange[]>(rows);
  });
}

export async function applyDraft(draftId: string): Promise<void> {
  return runMutation("drafts.apply", async () => {
    // Backend `apply` requires the draft to be `approved` first. Preserve the
    // previous one-click "apply pending" UX by approving then applying.
    await api.patch(`/drafts/${encodeURIComponent(draftId)}/status`, { status: "approved" });
    await api.post(`/drafts/${encodeURIComponent(draftId)}/apply`);
    await logAudit({ entity: "draft_changes", entityId: draftId, action: "apply" });
  }, { entity: "draft_changes", entityId: draftId, action: "apply" });
}

export async function rejectDraft(draftId: string, _note?: string): Promise<void> {
  return runMutation("drafts.reject", async () => {
    await api.patch(`/drafts/${encodeURIComponent(draftId)}/status`, { status: "rejected" });
    await logAudit({ entity: "draft_changes", entityId: draftId, action: "reject" });
  }, { entity: "draft_changes", entityId: draftId, action: "reject" });
}
