import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCurrentTenantBilling } from '@/modules/shared/services/billing';
import { useAuth } from '@/modules/auth/useAuth';
import { useTenant } from '@/modules/tenancy/TenantContext';
import { FEATURE_CATALOG, hasFeature } from './features';
import type { BillingFeatureKey } from '@/modules/shared/types';

export function useTenantEntitlements() {
  const { user } = useAuth();
  const { currentTenant } = useTenant();

  const query = useQuery({
    queryKey: ['billing:current', currentTenant?.id],
    enabled: !!user && !!currentTenant,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: () => getCurrentTenantBilling(),
  });

  const effectiveFeatures = useMemo(() => {
    const source = query.data?.effective_features ?? {};
    const out: Record<string, boolean> = {};
    for (const item of FEATURE_CATALOG) out[item.key] = hasFeature(source, item.key);
    return out;
  }, [query.data]);

  return {
    ...query,
    currentTenant,
    effectiveFeatures,
    hasFeature: (feature: BillingFeatureKey) => hasFeature(query.data?.effective_features, feature),
    currentPlanCode: query.data?.tenant_plan?.code ?? query.data?.subscription?.plan_code ?? query.data?.plan_catalog?.code ?? null,
    currentPlanName: query.data?.plan_catalog?.name ?? query.data?.tenant_plan?.code ?? null,
  };
}
