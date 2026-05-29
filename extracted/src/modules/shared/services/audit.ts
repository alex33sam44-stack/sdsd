// Audit log client. Posts to backend `/audit`, which writes the row server-side
// using the JWT-derived user id. Failures are logged but never thrown so that
// audit issues never break the user-facing mutation.
import { api, ApiError } from "@/lib/api";
import { runService } from "@/lib/serviceError";
import { logger } from "@/lib/logger";
import { snakify } from "./_camelToSnake";
import type { AuditLog } from "../types";

export async function logAudit(input: {
  entity: string;
  entityId?: string | null;
  action: string;
  diff?: Record<string, unknown>;
}): Promise<void> {
  try {
    await api.post("/audit", {
      entity: input.entity,
      entityId: input.entityId ?? undefined,
      action: input.action,
      diff: input.diff ?? null,
    });
  } catch (err) {
    // If unauthenticated (401) we just skip audit, mirroring the previous
    // "no user → no row" semantics. Other errors are warned but never thrown.
    const status = err instanceof ApiError ? err.status : undefined;
    if (status === 401) return;
    logger.warn("audit insert failed", {
      scope: "audit.log",
      entity: input.entity,
      entityId: input.entityId ?? undefined,
      action: input.action,
      error: { message: (err as Error)?.message, status },
    });
  }
}

export async function listAudit(entity?: string, limit = 100): Promise<AuditLog[]> {
  return runService("audit.list", async () => {
    const qs = new URLSearchParams();
    if (entity) qs.set("entity", entity);
    qs.set("limit", String(limit));
    const rows = await api.get<unknown[]>(`/audit?${qs.toString()}`);
    return snakify<AuditLog[]>(rows);
  });
}
