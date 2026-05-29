import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { tenantStore } from "@/lib/api";
import { useAuth } from "@/modules/auth/useAuth";
import type { TenantMembership, TenantSummary } from "@/modules/shared/types";

type TenantContextValue = {
  memberships: TenantMembership[];
  currentTenant: TenantSummary | null;
  currentTenantRole: TenantMembership["role"] | null;
  switchTenant: (slug: string) => void;
};

const TenantContext = createContext<TenantContextValue>({
  memberships: [],
  currentTenant: null,
  currentTenantRole: null,
  switchTenant: () => undefined,
});

function mapTenant(m: TenantMembership): TenantSummary {
  return {
    id: m.tenant_id,
    slug: m.tenant_slug,
    name: m.tenant_name,
    status: m.tenant_status,
  };
}

function inferTenantSlugFromHost(): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname.toLowerCase();
  if (!host || host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  const parts = host.split('.');
  if (parts.length >= 3 && !["www", "api"].includes(parts[0])) return parts[0];
  return null;
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { memberships, currentTenant, currentTenantRole } = useAuth();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(tenantStore.slug);

  useEffect(() => {
    const stop = tenantStore.subscribe(setSelectedSlug);
    return stop;
  }, []);

  useEffect(() => {
    if (!memberships.length) {
      if (currentTenant?.slug) {
        if (tenantStore.slug !== currentTenant.slug) tenantStore.set(currentTenant.slug);
        return;
      }
      const inferred = inferTenantSlugFromHost();
      if (!tenantStore.slug && inferred) tenantStore.set(inferred);
      return;
    }
    const stillValid = selectedSlug && memberships.some((m) => m.tenant_slug === selectedSlug);
    if (stillValid) return;
    if (currentTenant?.slug) {
      tenantStore.set(currentTenant.slug);
      return;
    }
    tenantStore.set(memberships[0].tenant_slug);
  }, [memberships, currentTenant?.slug, selectedSlug]);

  const effective = useMemo(() => {
    const matchedMembership = memberships.find((m) => m.tenant_slug === (tenantStore.slug ?? selectedSlug ?? currentTenant?.slug));
    if (matchedMembership) {
      return {
        memberships,
        currentTenant: mapTenant(matchedMembership),
        currentTenantRole: matchedMembership.role,
      };
    }
    return {
      memberships,
      currentTenant,
      currentTenantRole,
    };
  }, [memberships, currentTenant, currentTenantRole, selectedSlug]);

  const value = useMemo<TenantContextValue>(() => ({
    memberships: effective.memberships,
    currentTenant: effective.currentTenant,
    currentTenantRole: effective.currentTenantRole,
    switchTenant: (slug: string) => tenantStore.set(slug),
  }), [effective]);

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  return useContext(TenantContext);
}
