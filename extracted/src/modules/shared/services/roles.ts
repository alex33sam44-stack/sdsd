// User role assignment service. All mutations are audited via the backend.
// Backed by `/roles/:userId` (GET, POST, DELETE).
import { api } from "@/lib/api";
import { logAudit } from "./audit";
import { runMutation, runService } from "@/lib/serviceError";
import type { AppRole } from "../types";
import { APP_ROLES } from "./enums";

function assertRole(role: string): AppRole {
  if (!(APP_ROLES as readonly string[]).includes(role)) {
    throw new Error(`دور غير صالح: ${role}`);
  }
  return role as AppRole;
}

export async function listUserRoles(userId: string): Promise<AppRole[]> {
  return runService("roles.list", async () => {
    const rows = await api.get<Array<{ role: AppRole }>>(`/roles/${encodeURIComponent(userId)}`);
    return (rows ?? []).map((r) => r.role);
  });
}

export async function grantRole(userId: string, role: AppRole): Promise<void> {
  return runMutation("roles.grant", async () => {
    const safe = assertRole(role);
    await api.post(`/roles/${encodeURIComponent(userId)}`, { role: safe });
    await logAudit({ entity: "user_roles", entityId: userId, action: "grant", diff: { role: safe } });
  }, { entity: "user_roles", entityId: userId, action: "grant" });
}

export async function revokeRole(userId: string, role: AppRole): Promise<void> {
  return runMutation("roles.revoke", async () => {
    const safe = assertRole(role);
    await api.delete(`/roles/${encodeURIComponent(userId)}/${encodeURIComponent(safe)}`);
    await logAudit({ entity: "user_roles", entityId: userId, action: "revoke", diff: { role: safe } });
  }, { entity: "user_roles", entityId: userId, action: "revoke" });
}

export async function setUserRoles(userId: string, target: AppRole[]): Promise<void> {
  const current = await listUserRoles(userId);
  const toAdd = target.filter((r) => !current.includes(r));
  const toRemove = current.filter((r) => !target.includes(r));
  for (const r of toAdd) await grantRole(userId, r);
  for (const r of toRemove) await revokeRole(userId, r);
}
