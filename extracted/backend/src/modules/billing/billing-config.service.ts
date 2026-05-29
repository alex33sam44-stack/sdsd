import { Injectable } from '@nestjs/common';
import { BillingInterval, BillingProvider } from '@prisma/client';

function normalizeProvider(value?: string | null): BillingProvider | null {
  switch ((value ?? '').trim()) {
    case 'stripe':
      return BillingProvider.stripe;
    case 'lemon':
    case 'lemon_squeezy':
    case 'lemonsqueezy':
      return BillingProvider.lemon_squeezy;
    case 'manual':
      return BillingProvider.manual;
    default:
      return null;
  }
}

function toEnvPlanKey(planCode: string) {
  return planCode.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

@Injectable()
export class BillingConfigService {
  getDefaultProvider(): BillingProvider {
    const requested = normalizeProvider(process.env.BILLING_DEFAULT_PROVIDER);
    if (requested === BillingProvider.stripe && this.isStripeConfigured()) return requested;
    if (requested === BillingProvider.lemon_squeezy && this.isLemonConfigured()) return requested;
    if (requested === BillingProvider.manual) return requested;
    if (this.isStripeConfigured()) return BillingProvider.stripe;
    if (this.isLemonConfigured()) return BillingProvider.lemon_squeezy;
    return BillingProvider.manual;
  }

  listProviderOptions() {
    const def = this.getDefaultProvider();
    return [
      {
        provider: BillingProvider.manual,
        configured: true,
        can_checkout: true,
        can_portal: true,
        default_provider: def === BillingProvider.manual,
      },
      {
        provider: BillingProvider.stripe,
        configured: this.isStripeConfigured(),
        can_checkout: this.canStripeCheckout(),
        can_portal: this.canStripePortal(),
        default_provider: def === BillingProvider.stripe,
      },
      {
        provider: BillingProvider.lemon_squeezy,
        configured: this.isLemonConfigured(),
        can_checkout: this.canLemonCheckout(),
        can_portal: this.canLemonPortal(),
        default_provider: def === BillingProvider.lemon_squeezy,
      },
    ];
  }

  getPortalReturnUrl() {
    return this.stripTrailingSlash(
      process.env.BILLING_PORTAL_RETURN_URL
      || process.env.BILLING_APP_URL
      || process.env.FRONTEND_URL
      || this.firstOrigin()
      || process.env.APP_REDIRECT_URI
      || 'https://example.com',
    );
  }

  getStripeSecretKey() {
    return (process.env.STRIPE_SECRET_KEY ?? '').trim();
  }

  getStripeWebhookSecret() {
    return (process.env.STRIPE_WEBHOOK_SECRET ?? '').trim();
  }

  getStripePublishableKey() {
    return (process.env.STRIPE_PUBLISHABLE_KEY ?? '').trim();
  }

  getStripePriceId(planCode: string, interval: BillingInterval) {
    const key = `${toEnvPlanKey(planCode)}_${interval.toUpperCase()}`;
    return (process.env[`BILLING_STRIPE_PRICE_${key}`] ?? process.env[`STRIPE_PRICE_${key}`] ?? '').trim() || null;
  }

  getPlanCodeForStripePrice(priceId?: string | null) {
    if (!priceId) return null;
    for (const [key, value] of Object.entries(process.env)) {
      if ((!key.startsWith('BILLING_STRIPE_PRICE_') && !key.startsWith('STRIPE_PRICE_')) || !value || value.trim() !== priceId) continue;
      const tail = key.replace(/^BILLING_STRIPE_PRICE_/, '').replace(/^STRIPE_PRICE_/, '');
      const match = tail.match(/^(.*)_(MONTHLY|YEARLY|CUSTOM)$/);
      if (!match) continue;
      return match[1].toLowerCase();
    }
    return null;
  }

  getLemonApiKey() {
    return (process.env.LEMON_SQUEEZY_API_KEY ?? '').trim();
  }

  getLemonStoreId() {
    return (process.env.LEMON_SQUEEZY_STORE_ID ?? '').trim();
  }

  getLemonWebhookSecret() {
    return (process.env.LEMON_SQUEEZY_WEBHOOK_SECRET ?? '').trim();
  }

  getLemonVariantId(planCode: string, interval: BillingInterval) {
    const key = `${toEnvPlanKey(planCode)}_${interval.toUpperCase()}`;
    return (process.env[`BILLING_LEMON_VARIANT_${key}`] ?? process.env[`LEMON_VARIANT_${key}`] ?? '').trim() || null;
  }

  getPlanCodeForLemonVariant(variantId?: string | number | null) {
    if (variantId == null) return null;
    const normalized = String(variantId).trim();
    for (const [key, value] of Object.entries(process.env)) {
      if ((!key.startsWith('BILLING_LEMON_VARIANT_') && !key.startsWith('LEMON_VARIANT_')) || !value || value.trim() !== normalized) continue;
      const tail = key.replace(/^BILLING_LEMON_VARIANT_/, '').replace(/^LEMON_VARIANT_/, '');
      const match = tail.match(/^(.*)_(MONTHLY|YEARLY|CUSTOM)$/);
      if (!match) continue;
      return match[1].toLowerCase();
    }
    return null;
  }

  buildCheckoutSuccessUrl(explicit?: string | null) {
    const candidate = explicit?.trim();
    if (candidate) return candidate;
    const configured = (process.env.BILLING_SUCCESS_URL ?? '').trim();
    if (configured) return configured;
    return `${this.getAppBaseUrl()}/admin/billing?checkout=success`;
  }

  buildCheckoutCancelUrl(explicit?: string | null) {
    const candidate = explicit?.trim();
    if (candidate) return candidate;
    const configured = (process.env.BILLING_CANCEL_URL ?? '').trim();
    if (configured) return configured;
    return `${this.getAppBaseUrl()}/admin/billing?checkout=cancel`;
  }


  private getAppBaseUrl() {
    return this.stripTrailingSlash(
      process.env.BILLING_APP_URL
      || process.env.FRONTEND_URL
      || this.firstOrigin()
      || process.env.APP_REDIRECT_URI
      || 'https://example.com',
    );
  }

  private stripTrailingSlash(value: string) {
    return value.replace(/\/+$/, '');
  }

  private firstOrigin() {
    const first = (process.env.CORS_ORIGIN ?? '').split(',').map((o) => o.trim()).find(Boolean);
    return first || null;
  }

  isStripeConfigured() {
    return !!this.getStripeSecretKey();
  }

  isLemonConfigured() {
    return !!this.getLemonApiKey() && !!this.getLemonStoreId();
  }

  canStripeCheckout() {
    return this.isStripeConfigured();
  }

  canStripePortal() {
    return this.isStripeConfigured();
  }

  canLemonCheckout() {
    return this.isLemonConfigured();
  }

  canLemonPortal() {
    return this.isLemonConfigured();
  }
}
