import { useEffect, useState } from "react";
import { authApi, tokenStore, tenantStore, ApiError } from "@/lib/api";
import { logger } from "@/lib/logger";
import type { AppRole, PlatformRole, TenantMembership, TenantRole, TenantSummary } from "@/modules/shared/types";

export type AuthUser = {
  id: string;
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
};

type MePayload = AuthUser & {
  roles?: AppRole[];
  platformRoles?: PlatformRole[];
  memberships?: Array<{
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    tenantStatus: TenantMembership["tenant_status"];
    role: TenantMembership["role"];
    acceptedAt: string | null;
  }>;
  currentTenant?: TenantSummary | null;
  currentTenantRole?: TenantRole | null;
};

type AuthState = {
  user: AuthUser | null;
  session: { user: AuthUser } | null;
  /** legacy combined roles kept for backwards-compat with older route guards */
  roles: AppRole[];
  platformRoles: PlatformRole[];
  memberships: TenantMembership[];
  currentTenant: TenantSummary | null;
  currentTenantRole: TenantRole | null;
  loading: boolean;
  error: string | null;
};

const initial: AuthState = {
  user: null,
  session: null,
  roles: [],
  platformRoles: [],
  memberships: [],
  currentTenant: null,
  currentTenantRole: null,
  loading: true,
  error: null,
};

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(initial);

  useEffect(() => {
    let cancelled = false;

    async function loadMe() {
      if (!tokenStore.access) {
        if (!cancelled) setState({ ...initial, loading: false });
        return;
      }
      try {
        const me = await authApi.me<MePayload>();
        if (cancelled) return;
        const user: AuthUser = {
          id: me.id,
          email: me.email,
          displayName: me.displayName ?? null,
          avatarUrl: me.avatarUrl ?? null,
        };
        setState({
          user,
          session: { user },
          roles: (me.roles ?? []) as AppRole[],
          platformRoles: (me.platformRoles ?? []) as PlatformRole[],
          memberships: (me.memberships ?? []).map((m) => ({
            tenant_id: m.tenantId,
            tenant_slug: m.tenantSlug,
            tenant_name: m.tenantName,
            tenant_status: m.tenantStatus,
            role: m.role,
            accepted_at: m.acceptedAt,
          })) as TenantMembership[],
          currentTenant: me.currentTenant ?? null,
          currentTenantRole: me.currentTenantRole ?? null,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setState({ ...initial, loading: false });
          return;
        }
        logger.warn("useAuth: failed to load /auth/me", { err });
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : "auth_load_failed",
        }));
      }
    }

    loadMe();

    const unsubscribe = tokenStore.subscribe((event) => {
      if (event === "signed_out") {
        setState({ ...initial, loading: false });
      } else {
        setState((s) => ({ ...s, loading: true }));
        loadMe();
      }
    });

    const unsubscribeTenant = tenantStore.subscribe(() => {
      if (!tokenStore.access) return;
      setState((s) => ({ ...s, loading: true }));
      loadMe();
    });

    function onStorage(e: StorageEvent) {
      if (e.key === "auth.accessToken") loadMe();
    }
    window.addEventListener("storage", onStorage);

    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeTenant();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return state;
}

const TENANT_OPERATOR_ROLES: TenantRole[] = [
  "tenant_owner",
  "tenant_admin",
  "ops_manager",
  "station_manager",
  "line_supervisor",
];

export function hasRole(
  roles: AppRole[],
  target: AppRole | AppRole[],
  options?: { platformRoles?: PlatformRole[]; tenantRole?: TenantRole | null },
): boolean {
  const targets = Array.isArray(target) ? target : [target];
  const platformRoles = options?.platformRoles ?? [];
  const tenantRole = options?.tenantRole ?? null;
  return targets.some((t) => {
    if (t === "station_operator") return roles.includes("station_operator") || (!!tenantRole && TENANT_OPERATOR_ROLES.includes(tenantRole));
    if (t === "platform_admin") return platformRoles.includes("platform_admin") || platformRoles.includes("platform_owner");
    return roles.includes(t);
  });
}
