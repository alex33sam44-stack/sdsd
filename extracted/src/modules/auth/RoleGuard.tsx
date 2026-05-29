import { Navigate, useLocation } from "react-router-dom";
import type { AppRole, TenantRole, PlatformRole } from "@/modules/shared/types";
import { hasRole, useAuth } from "./useAuth";
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";

type MatchMode = "any" | "all";

type Props = {
  children: ReactNode;
  roles?: AppRole | AppRole[];
  platformRoles?: PlatformRole | PlatformRole[];
  tenantRoles?: TenantRole | TenantRole[];
  match?: MatchMode;
  redirectTo?: string;
};

function matchesTenantRole(current: TenantRole | null, required?: TenantRole | TenantRole[]) {
  if (!required) return true;
  const list = Array.isArray(required) ? required : [required];
  return !!current && list.includes(current);
}

function matchesPlatformRole(current: PlatformRole[], required?: PlatformRole | PlatformRole[]) {
  if (!required) return true;
  const list = Array.isArray(required) ? required : [required];
  return list.some((r) => current.includes(r));
}

export function RoleGuard({ children, roles, platformRoles, tenantRoles, match = "any", redirectTo = "/auth" }: Props) {
  const { user, roles: userRoles, platformRoles: userPlatformRoles, currentTenantRole, loading } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="h-10 w-10 rounded-full border-4 border-secondary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to={redirectTo} state={{ from: location.pathname + location.search }} replace />;

  const checks: boolean[] = [];
  if (roles) checks.push(hasRole(userRoles, roles, { platformRoles: userPlatformRoles, tenantRole: currentTenantRole }));
  if (tenantRoles) checks.push(matchesTenantRole(currentTenantRole, tenantRoles));
  if (platformRoles) checks.push(matchesPlatformRole(userPlatformRoles, platformRoles));

  const allowed = checks.length === 0 ? true : match === "all" ? checks.every(Boolean) : checks.some(Boolean);

  if (!allowed) {
    return (
      <div className="min-h-screen grid place-items-center px-6 text-center">
        <div className="max-w-sm">
          <p className="text-2xl font-black text-secondary mb-2">{t("roleGuard.unauthorized")}</p>
          <p className="text-sm font-semibold text-muted-foreground">{t("roleGuard.noPermission")}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
