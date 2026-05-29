import { BillingInterval, BillingProvider, SubscriptionStatus } from '@prisma/client';

export type CheckoutIntentInput = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  planCode: string;
  interval: BillingInterval;
  seats: number;
  provider?: BillingProvider;
  billingEmail?: string | null;
  billingName?: string | null;
  externalCustomerId?: string | null;
  successUrl?: string | null;
  cancelUrl?: string | null;
};

export type CheckoutSessionResult = {
  provider: BillingProvider;
  mode: 'external' | 'manual';
  url: string;
  externalSessionId?: string | null;
  externalCustomerId?: string | null;
  message?: string | null;
};

export type BillingPortalInput = {
  externalCustomerId?: string | null;
  providerMetadata?: Record<string, unknown> | null;
};

export type BillingPortalResult = {
  provider: BillingProvider;
  mode: 'external' | 'manual';
  url: string;
  message?: string | null;
};

export type NormalizedBillingEvent = {
  provider: BillingProvider;
  eventType: string;
  payload: unknown;
  externalEventId?: string | null;
  tenantId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
  planCode?: string | null;
  status?: SubscriptionStatus | null;
  interval?: BillingInterval | null;
  seats?: number | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  trialEndsAt?: Date | null;
  cancelAtPeriodEnd?: boolean | null;
  billingEmail?: string | null;
  billingName?: string | null;
  portalUrl?: string | null;
  invoiceUrl?: string | null;
};
