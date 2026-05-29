import { BadRequestException, Injectable } from '@nestjs/common';
import { BillingInterval, BillingProvider, SubscriptionStatus } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { BillingConfigService } from '../billing-config.service';
import type {
  BillingPortalInput,
  BillingPortalResult,
  CheckoutIntentInput,
  CheckoutSessionResult,
  NormalizedBillingEvent,
} from '../billing.types';

@Injectable()
export class StripeProviderService {
  constructor(private readonly config: BillingConfigService) {}

  async createCheckoutSession(input: CheckoutIntentInput): Promise<CheckoutSessionResult> {
    const secret = this.config.getStripeSecretKey();
    if (!secret) throw new BadRequestException('Stripe is not configured');
    const priceId = this.config.getStripePriceId(input.planCode, input.interval);
    if (!priceId) {
      throw new BadRequestException(`Missing Stripe price mapping for ${input.planCode}/${input.interval}`);
    }

    const params = new URLSearchParams();
    params.set('mode', 'subscription');
    params.set('success_url', this.config.buildCheckoutSuccessUrl(input.successUrl));
    params.set('cancel_url', this.config.buildCheckoutCancelUrl(input.cancelUrl));
    params.set('client_reference_id', input.tenantId);
    params.set('line_items[0][price]', priceId);
    params.set('line_items[0][quantity]', String(Math.max(1, Number(input.seats || 1))));
    params.set('metadata[tenantId]', input.tenantId);
    params.set('metadata[tenantSlug]', input.tenantSlug);
    params.set('metadata[tenantName]', input.tenantName);
    params.set('metadata[planCode]', input.planCode);
    params.set('metadata[interval]', input.interval);
    params.set('metadata[seats]', String(input.seats));
    params.set('subscription_data[metadata][tenantId]', input.tenantId);
    params.set('subscription_data[metadata][tenantSlug]', input.tenantSlug);
    params.set('subscription_data[metadata][planCode]', input.planCode);
    params.set('subscription_data[metadata][interval]', input.interval);
    params.set('subscription_data[metadata][seats]', String(input.seats));
    if (input.externalCustomerId) {
      params.set('customer', input.externalCustomerId);
    } else if (input.billingEmail) {
      params.set('customer_email', input.billingEmail);
    }
    params.set('allow_promotion_codes', 'true');

    const session = await this.request('/checkout/sessions', {
      method: 'POST',
      body: params,
    });

    return {
      provider: BillingProvider.stripe,
      mode: 'external',
      url: String(session.url || ''),
      externalSessionId: session.id ? String(session.id) : null,
      externalCustomerId: session.customer ? String(session.customer) : null,
      message: 'Stripe checkout session created',
    };
  }

  async createPortalSession(input: BillingPortalInput): Promise<BillingPortalResult> {
    const secret = this.config.getStripeSecretKey();
    if (!secret) throw new BadRequestException('Stripe is not configured');
    if (!input.externalCustomerId) {
      throw new BadRequestException('Stripe portal requires an external customer id');
    }
    const params = new URLSearchParams();
    params.set('customer', input.externalCustomerId);
    params.set('return_url', this.config.getPortalReturnUrl());
    const session = await this.request('/billing_portal/sessions', {
      method: 'POST',
      body: params,
    });
    return {
      provider: BillingProvider.stripe,
      mode: 'external',
      url: String(session.url || this.config.getPortalReturnUrl()),
      message: 'Stripe billing portal opened',
    };
  }

  verifySignature(rawBody: Buffer, signature?: string | string[]) {
    const secret = this.config.getStripeWebhookSecret();
    if (!secret) return false;
    const sigHeader = Array.isArray(signature) ? signature[0] : signature;
    if (!sigHeader) return false;
    const parts = Object.fromEntries(sigHeader.split(',').map((part) => {
      const [k, v] = part.split('=');
      return [k, v];
    }));
    const timestamp = parts.t;
    const v1 = parts.v1;
    if (!timestamp || !v1) return false;
    const ts = Number(timestamp);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(ts) || Math.abs(now - ts) > 300) return false;
    const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
    const digest = createHmac('sha256', secret).update(signedPayload).digest('hex');
    try {
      return timingSafeEqual(Buffer.from(digest), Buffer.from(v1));
    } catch {
      return false;
    }
  }

  parseWebhook(rawBody: Buffer): NormalizedBillingEvent {
    const event = JSON.parse(rawBody.toString('utf8')) as any;
    const type = String(event?.type || 'unknown');
    const obj = event?.data?.object ?? {};
    const metadata = this.asRecord(obj.metadata);
    const lineItem = Array.isArray(obj.items?.data) ? obj.items.data[0] : null;
    const recurringInterval = lineItem?.price?.recurring?.interval ?? obj?.plan?.interval ?? metadata?.interval ?? null;
    const priceId = lineItem?.price?.id ?? obj?.plan?.id ?? null;
    const normalized: NormalizedBillingEvent = {
      provider: BillingProvider.stripe,
      eventType: type,
      payload: event,
      externalEventId: event?.id ? String(event.id) : null,
      tenantId: this.stringOrNull(metadata?.tenantId) ?? this.stringOrNull(obj.client_reference_id),
      customerId: this.stringOrNull(obj.customer),
      subscriptionId: this.stringOrNull(obj.subscription) ?? this.stringOrNull(obj.id),
      planCode: this.stringOrNull(metadata?.planCode) ?? this.config.getPlanCodeForStripePrice(this.stringOrNull(priceId)),
      interval: this.normalizeInterval(recurringInterval),
      seats: this.numberOrNull(metadata?.seats) ?? this.numberOrNull(lineItem?.quantity),
      currentPeriodStart: this.unixToDate(obj.current_period_start),
      currentPeriodEnd: this.unixToDate(obj.current_period_end),
      trialEndsAt: this.unixToDate(obj.trial_end),
      cancelAtPeriodEnd: typeof obj.cancel_at_period_end === 'boolean' ? obj.cancel_at_period_end : null,
      billingEmail: this.stringOrNull(obj.customer_details?.email) ?? this.stringOrNull(obj.customer_email),
      billingName: this.stringOrNull(obj.customer_details?.name) ?? this.stringOrNull(obj.customer_name),
      invoiceUrl: this.stringOrNull(obj.hosted_invoice_url) ?? this.stringOrNull(obj.invoice_pdf),
      status: this.normalizeStatus(
        type === 'invoice.payment_failed' ? 'past_due' :
        type === 'customer.subscription.deleted' ? 'canceled' :
        type === 'invoice.payment_succeeded' ? 'active' :
        obj.status,
      ),
    };
    if (type === 'checkout.session.completed') {
      normalized.status = SubscriptionStatus.active;
      normalized.subscriptionId = this.stringOrNull(obj.subscription);
      normalized.customerId = this.stringOrNull(obj.customer);
      normalized.currentPeriodStart = null;
      normalized.currentPeriodEnd = null;
    }
    return normalized;
  }

  private async request(path: string, init: { method?: string; body?: URLSearchParams }) {
    const secret = this.config.getStripeSecretKey();
    const response = await fetch(`https://api.stripe.com/v1${path}`, {
      method: init.method ?? 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: init.body,
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new BadRequestException((json as any)?.error?.message ?? 'Stripe request failed');
    }
    return json as Record<string, unknown>;
  }

  private normalizeStatus(value: unknown): SubscriptionStatus | null {
    switch (String(value ?? '')) {
      case 'trialing':
        return SubscriptionStatus.trialing;
      case 'active':
        return SubscriptionStatus.active;
      case 'past_due':
      case 'unpaid':
        return SubscriptionStatus.past_due;
      case 'paused':
        return SubscriptionStatus.paused;
      case 'canceled':
      case 'cancelled':
        return SubscriptionStatus.canceled;
      case 'expired':
      case 'incomplete_expired':
        return SubscriptionStatus.expired;
      default:
        return null;
    }
  }

  private normalizeInterval(value: unknown): BillingInterval | null {
    switch (String(value ?? '').toLowerCase()) {
      case 'month':
      case 'monthly':
        return BillingInterval.monthly;
      case 'year':
      case 'yearly':
      case 'annual':
        return BillingInterval.yearly;
      case 'custom':
        return BillingInterval.custom;
      default:
        return null;
    }
  }

  private unixToDate(value: unknown) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : null;
  }

  private stringOrNull(value: unknown) {
    return value == null || value === '' ? null : String(value);
  }

  private numberOrNull(value: unknown) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  }
}
