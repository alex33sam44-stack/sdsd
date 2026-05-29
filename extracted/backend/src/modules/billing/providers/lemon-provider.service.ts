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
export class LemonProviderService {
  constructor(private readonly config: BillingConfigService) {}

  async createCheckoutSession(input: CheckoutIntentInput): Promise<CheckoutSessionResult> {
    const apiKey = this.config.getLemonApiKey();
    const storeId = this.config.getLemonStoreId();
    if (!apiKey || !storeId) throw new BadRequestException('Lemon Squeezy is not configured');
    const variantId = this.config.getLemonVariantId(input.planCode, input.interval);
    if (!variantId) {
      throw new BadRequestException(`Missing Lemon Squeezy variant mapping for ${input.planCode}/${input.interval}`);
    }

    const payload = {
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email: input.billingEmail ?? undefined,
            name: input.billingName ?? undefined,
            custom: {
              tenantId: input.tenantId,
              tenantSlug: input.tenantSlug,
              tenantName: input.tenantName,
              planCode: input.planCode,
              interval: input.interval,
              seats: String(input.seats),
            },
          },
          checkout_options: {
            embed: false,
            media: true,
            logo: true,
          },
          product_options: {
            enabled_variants: [Number(variantId)],
            redirect_url: this.config.buildCheckoutSuccessUrl(input.successUrl),
            receipt_button_text: 'Return to Mwasalat',
            receipt_link_url: this.config.getPortalReturnUrl(),
          },
          expires_at: null,
          preview: false,
          test_mode: false,
        },
        relationships: {
          store: { data: { type: 'stores', id: String(storeId) } },
          variant: { data: { type: 'variants', id: String(variantId) } },
        },
      },
    };

    const response = await this.request('/checkouts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const checkoutData = (response as any)?.data ?? {};
    const attrs = checkoutData?.attributes ?? {};
    return {
      provider: BillingProvider.lemon_squeezy,
      mode: 'external',
      url: String(attrs.url || attrs.checkout_url || ''),
      externalSessionId: checkoutData?.id ? String(checkoutData.id) : null,
      externalCustomerId: attrs?.customer_id ? String(attrs.customer_id) : null,
      message: 'Lemon Squeezy checkout created',
    };
  }

  async createPortalSession(input: BillingPortalInput): Promise<BillingPortalResult> {
    const metadata = this.asRecord(input.providerMetadata);
    const portalUrl = this.stringOrNull(metadata?.portalUrl)
      ?? this.stringOrNull((metadata?.urls as any)?.customer_portal)
      ?? this.stringOrNull((metadata?.urls as any)?.customer_portal_update_subscription)
      ?? this.stringOrNull((metadata?.urls as any)?.update_payment_method);
    return {
      provider: BillingProvider.lemon_squeezy,
      mode: 'external',
      url: portalUrl ?? this.config.getPortalReturnUrl(),
      message: portalUrl ? 'Lemon Squeezy customer portal opened' : 'No Lemon customer portal URL stored yet; showing billing return page instead.',
    };
  }

  verifySignature(rawBody: Buffer, signature?: string | string[]) {
    const secret = this.config.getLemonWebhookSecret();
    if (!secret) return false;
    const sig = Array.isArray(signature) ? signature[0] : signature;
    if (!sig) return false;
    const digest = createHmac('sha256', secret).update(rawBody).digest('hex');
    try {
      return timingSafeEqual(Buffer.from(digest), Buffer.from(sig));
    } catch {
      return false;
    }
  }

  parseWebhook(rawBody: Buffer): NormalizedBillingEvent {
    const payload = JSON.parse(rawBody.toString('utf8')) as any;
    const eventType = String(payload?.meta?.event_name || payload?.event_name || 'unknown');
    const data = payload?.data ?? {};
    const attrs = data?.attributes ?? {};
    const custom = this.asRecord(attrs.custom_data) ?? this.asRecord(payload?.meta?.custom_data) ?? {};
    const urls = this.asRecord(attrs.urls);
    const productName = this.stringOrNull(attrs.product_name) ?? this.stringOrNull(attrs.variant_name);
    const normalized: NormalizedBillingEvent = {
      provider: BillingProvider.lemon_squeezy,
      eventType,
      payload,
      externalEventId: this.stringOrNull(payload?.meta?.event_id) ?? this.stringOrNull(payload?.meta?.webhook_id),
      tenantId: this.stringOrNull(custom.tenantId),
      customerId: this.stringOrNull(attrs.customer_id),
      subscriptionId: this.stringOrNull(data?.id),
      planCode: this.stringOrNull(custom.planCode) ?? this.config.getPlanCodeForLemonVariant(attrs.variant_id),
      interval: this.normalizeInterval(custom.interval ?? attrs.billing_anchor),
      seats: this.numberOrNull(custom.seats),
      currentPeriodStart: this.isoToDate(attrs.billing_anchor),
      currentPeriodEnd: this.isoToDate(attrs.renews_at) ?? this.isoToDate(attrs.ends_at),
      trialEndsAt: this.isoToDate(attrs.trial_ends_at),
      cancelAtPeriodEnd: attrs.cancelled === true || attrs.cancelled_at != null ? true : null,
      billingEmail: this.stringOrNull(attrs.user_email),
      billingName: this.stringOrNull(attrs.user_name) ?? productName,
      portalUrl: this.stringOrNull(urls?.customer_portal_update_subscription) ?? this.stringOrNull(urls?.customer_portal),
      invoiceUrl: this.stringOrNull(urls?.receipt),
      status: this.normalizeStatus(attrs.status, eventType),
    };
    return normalized;
  }

  private async request(path: string, init: { method?: string; body?: string }) {
    const apiKey = this.config.getLemonApiKey();
    const response = await fetch(`https://api.lemonsqueezy.com/v1${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
      },
      body: init.body,
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new BadRequestException((json as any)?.errors?.[0]?.detail ?? 'Lemon Squeezy request failed');
    }
    return json as Record<string, unknown>;
  }

  private normalizeStatus(status: unknown, eventType?: string): SubscriptionStatus | null {
    const raw = String(status ?? '').toLowerCase();
    if (eventType === 'subscription_cancelled') return SubscriptionStatus.canceled;
    if (eventType === 'subscription_payment_failed') return SubscriptionStatus.past_due;
    if (eventType === 'subscription_payment_success') return SubscriptionStatus.active;
    switch (raw) {
      case 'on_trial':
      case 'trialing':
        return SubscriptionStatus.trialing;
      case 'active':
        return SubscriptionStatus.active;
      case 'past_due':
      case 'unpaid':
        return SubscriptionStatus.past_due;
      case 'paused':
        return SubscriptionStatus.paused;
      case 'cancelled':
      case 'canceled':
        return SubscriptionStatus.canceled;
      case 'expired':
        return SubscriptionStatus.expired;
      default:
        return null;
    }
  }

  private normalizeInterval(value: unknown): BillingInterval | null {
    switch (String(value ?? '').toLowerCase()) {
      case 'monthly':
      case 'month':
        return BillingInterval.monthly;
      case 'yearly':
      case 'annual':
      case 'year':
        return BillingInterval.yearly;
      case 'custom':
        return BillingInterval.custom;
      default:
        return null;
    }
  }

  private isoToDate(value: unknown) {
    if (!value) return null;
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : d;
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
