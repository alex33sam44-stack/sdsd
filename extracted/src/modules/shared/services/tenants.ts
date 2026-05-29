import { api } from "@/lib/api";
import type { TenantMembership, TenantRole, TenantSummary } from "../types";

export type TenantMember = {
  id: string;
  email: string;
  displayName: string | null;
  platformRoles: string[];
  tenantRole: TenantRole;
  acceptedAt: string | null;
};

export type TenantInvite = {
  id: string;
  email: string;
  role: TenantRole;
  token: string;
  status: string;
  expiresAt: string;
  acceptedAt?: string | null;
  createdAt?: string;
};

export async function createTenant(input: { name: string; slug?: string }): Promise<TenantSummary> {
  return api.post<TenantSummary>("/tenants", input);
}

export async function listMyTenants(): Promise<TenantMembership[]> {
  const rows = await api.get<Array<any>>("/tenants/me");
  return (rows ?? []).map((m) => ({
    tenant_id: m.tenantId,
    tenant_slug: m.tenant?.slug ?? m.tenantSlug,
    tenant_name: m.tenant?.name ?? m.tenantName,
    tenant_status: m.tenant?.status ?? m.tenantStatus,
    role: m.role,
    accepted_at: m.acceptedAt ?? null,
  }));
}

export async function listCurrentTenantMembers(): Promise<TenantMember[]> {
  const rows = await api.get<Array<any>>("/tenants/current/members");
  return (rows ?? []).map((m) => ({
    id: m.user.id,
    email: m.user.email,
    displayName: m.user.profile?.displayName ?? null,
    platformRoles: (m.user.roles ?? []).map((r: any) => r.role),
    tenantRole: m.role,
    acceptedAt: m.acceptedAt ?? null,
  }));
}

export async function listCurrentTenantInvites(): Promise<TenantInvite[]> {
  const rows = await api.get<Array<any>>("/tenants/current/invitations");
  return (rows ?? []).map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    token: r.token,
    status: r.status,
    expiresAt: r.expiresAt,
    acceptedAt: r.acceptedAt ?? null,
    createdAt: r.createdAt,
  }));
}

export async function inviteTenantMember(input: { email: string; role: TenantRole; expiresInDays?: number }): Promise<TenantInvite> {
  const r = await api.post<any>("/tenants/current/invitations", input);
  return {
    id: r.id,
    email: r.email,
    role: r.role,
    token: r.token,
    status: r.status,
    expiresAt: r.expiresAt,
    acceptedAt: r.acceptedAt ?? null,
    createdAt: r.createdAt,
  };
}

export async function acceptTenantInvite(token: string) {
  return api.post("/tenants/invitations/accept", { token });
}

export async function revokeTenantInvite(inviteId: string) {
  return api.delete(`/tenants/current/invitations/${encodeURIComponent(inviteId)}`);
}

export async function changeTenantMemberRole(userId: string, role: TenantRole) {
  return api.patch(`/tenants/current/members/${encodeURIComponent(userId)}`, { role });
}

export async function removeTenantMember(userId: string) {
  return api.delete(`/tenants/current/members/${encodeURIComponent(userId)}`);
}

export async function listTenantsAdmin(): Promise<TenantSummary[]> {
  return api.get<TenantSummary[]>("/tenants");
}

export async function setTenantStatus(tenantId: string, status: TenantSummary['status']) {
  return api.patch(`/tenants/${encodeURIComponent(tenantId)}/status`, { status });
}
