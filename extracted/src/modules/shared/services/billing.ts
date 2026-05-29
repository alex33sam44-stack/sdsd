import { api } from '@/lib/api';
import { runMutation, runService } from '@/lib/serviceError';
import type {
  BillingCheckoutSession,
  BillingPlan,
  BillingPortalSession,
  BillingProfile,
  BillingProvider,
  BillingProviderOption,
  BillingSummary,
  BillingUsage,
  BillingWebhookEvent,
  TenantBillingOverview,
  TenantEntitlements,
} from '../types';
import { snakify } from './_camelToSnake';

export async function listBillingPlans(): Promise<BillingPlan[]> {
  return runService('billing.plans', async () => {
    const rows = await api.get<unknown[]>('/billing/plans');
    return snakify<BillingPlan[]>(rows).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  });
}

export async function listBillingProviderOptions(): Promise<BillingProviderOption[]> {
  return runService('billing.providers', async () => {
    const rows = await api.get<unknown[]>('/billing/providers');
    return snakify<BillingProviderOption[]>(rows);
  });
}

export async function startBillingCheckout(input: {
  plan_code?: string;
  interval?: 'monthly' | 'yearly' | 'custom';
  seats?: number;
  provider?: BillingProvider;
  success_url?: string | null;
  cancel_url?: string | null;
}): Promise<BillingCheckoutSession> {
  return runMutation('billing.checkout', async () => {
    const row = await api.post<unknown>('/billing/current/checkout', {
      planCode: input.plan_code,
      interval: input.interval,
      seats: input.seats,
      provider: input.provider,
      successUrl: input.success_url,
      cancelUrl: input.cancel_url,
    });
    return snakify<BillingCheckoutSession>(row);
  }, { entity: 'tenant_subscription', action: 'checkout' });
}

export async function openBillingPortal(input: { provider?: BillingProvider } = {}): Promise<BillingPortalSession> {
  return runMutation('billing.portal', async () => {
    const row = await api.post<unknown>('/billing/current/portal', { provider: input.provider });
    return snakify<BillingPortalSession>(row);
  }, { entity: 'tenant_subscription', action: 'portal' });
}

export async function listBillingWebhookEvents(): Promise<BillingWebhookEvent[]> {
  return runService('billing.webhooks', async () => {
    const rows = await api.get<unknown[]>('/billing/current/webhooks');
    return snakify<BillingWebhookEvent[]>(rows);
  });
}

export async function getCurrentTenantBilling(): Promise<TenantBillingOverview> {
  return runService('billing.current', async () => {
    const row = await api.get<unknown>('/billing/current');
    return snakify<TenantBillingOverview>(row);
  });
}

export async function getCurrentTenantEntitlements(): Promise<TenantEntitlements> {
  return runService('billing.entitlements', async () => {
    const row = await api.get<unknown>('/billing/current/entitlements');
    return snakify<TenantEntitlements>(row);
  });
}

export async function getCurrentTenantUsage(): Promise<BillingUsage> {
  return runService('billing.usage', async () => {
    const row = await api.get<unknown>('/billing/current/usage');
    return snakify<BillingUsage>(row);
  });
}

export async function updateCurrentTenantPlan(input: {
  code?: string;
  status?: string;
  seat_limit?: number | null;
  limits?: Record<string, unknown> | null;
  features?: Record<string, unknown> | null;
  renews_at?: string | null;
  seats?: number;
  interval?: 'monthly' | 'yearly' | 'custom';
  trial_ends_at?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
}): Promise<TenantBillingOverview> {
  return runMutation('billing.plan.update', async () => {
    const row = await api.patch<unknown>('/billing/current/plan', {
      code: input.code,
      status: input.status,
      seatLimit: input.seat_limit,
      limits: input.limits,
      features: input.features,
      renewsAt: input.renews_at,
      seats: input.seats,
      interval: input.interval,
      trialEndsAt: input.trial_ends_at,
      currentPeriodStart: input.current_period_start,
      currentPeriodEnd: input.current_period_end,
      cancelAtPeriodEnd: input.cancel_at_period_end,
    });
    return snakify<TenantBillingOverview>(row);
  }, { entity: 'tenant_plan', action: 'update' });
}

export async function updateCurrentTenantBillingProfile(input: {
  provider?: 'manual' | 'stripe' | 'lemon_squeezy';
  billing_email?: string | null;
  billing_name?: string | null;
  country_code?: string | null;
  tax_id?: string | null;
  currency?: string | null;
  external_customer_id?: string | null;
}): Promise<BillingProfile> {
  return runMutation('billing.profile.update', async () => {
    const row = await api.patch<unknown>('/billing/current/profile', {
      provider: input.provider,
      billingEmail: input.billing_email,
      billingName: input.billing_name,
      countryCode: input.country_code,
      taxId: input.tax_id,
      currency: input.currency,
      externalCustomerId: input.external_customer_id,
    });
    return snakify<BillingProfile>(row);
  }, { entity: 'tenant_billing_profile', action: 'update' });
}

export async function listBillingAdminSummary(): Promise<BillingSummary[]> {
  return runService('billing.admin.summary', async () => {
    const rows = await api.get<unknown[]>('/billing/admin/summary');
    return snakify<BillingSummary[]>(rows);
  });
}
