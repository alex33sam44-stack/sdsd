import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BillingInterval,
  BillingProvider,
  BillingWebhookEvent,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DEFAULT_BILLING_PLANS } from './default-plans';
import { BILLING_FEATURE_CATALOG, type BillingFeatureKey, normalizeFeatureMap } from './entitlements';
import { BillingConfigService } from './billing-config.service';
import { LemonProviderService } from './providers/lemon-provider.service';
import { StripeProviderService } from './providers/stripe-provider.service';
import type {
  BillingPortalResult,
  CheckoutIntentInput,
  CheckoutSessionResult,
  NormalizedBillingEvent,
} from './billing.types';

type UsageMetric = 'stations' | 'lines' | 'routeStops' | 'members' | 'pendingInvites' | 'seats';

type CurrentBillingPayload = {
  code?: string;
  status?: string;
  seatLimit?: number | null;
  limits?: Record<string, unknown> | null;
  features?: Record<string, unknown> | null;
  renewsAt?: string | null;
  provider?: BillingProvider;
  interval?: BillingInterval;
  seats?: number;
  trialEndsAt?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
};

type BillingProfilePayload = {
  provider?: BillingProvider;
  billingEmail?: string | null;
  billingName?: string | null;
  countryCode?: string | null;
  taxId?: string | null;
  currency?: string | null;
  providerMetadata?: Record<string, unknown> | null;
};

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: BillingConfigService,
    private readonly stripe: StripeProviderService,
    private readonly lemon: LemonProviderService,
  ) {}

  async seedDefaultPlans() {
    for (const plan of DEFAULT_BILLING_PLANS) {
      await this.prisma.billingPlan.upsert({
        where: { code: plan.code },
        update: {
          name: plan.name,
          description: plan.description ?? null,
          currency: plan.currency,
          monthlyPriceMinor: plan.monthlyPriceMinor,
          yearlyPriceMinor: plan.yearlyPriceMinor,
          includedSeats: plan.includedSeats,
          defaultLimits: plan.defaultLimits,
          defaultFeatures: plan.defaultFeatures,
          isPublic: plan.isPublic,
          sortOrder: plan.sortOrder,
        },
        create: {
          code: plan.code,
          name: plan.name,
          description: plan.description ?? null,
          currency: plan.currency,
          monthlyPriceMinor: plan.monthlyPriceMinor,
          yearlyPriceMinor: plan.yearlyPriceMinor,
          includedSeats: plan.includedSeats,
          defaultLimits: plan.defaultLimits,
          defaultFeatures: plan.defaultFeatures,
          isPublic: plan.isPublic,
          sortOrder: plan.sortOrder,
        },
      });
    }
  }

  listProviderOptions() {
    return this.config.listProviderOptions();
  }

  async listPlans(includeHidden = false) {
    await this.seedDefaultPlans();
    return this.prisma.billingPlan.findMany({
      where: includeHidden ? {} : { isPublic: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async ensureTenantBillingFoundation(tenantId: string) {
    await this.seedDefaultPlans();
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true, billingProfile: true, subscription: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const desiredCode = tenant.plan?.code ?? 'starter';
    const catalogPlan = await this.ensurePlanExists(desiredCode);
    const effectiveSeats = tenant.plan?.seatLimit ?? catalogPlan.includedSeats ?? 1;

    const [billingProfile, subscription, tenantPlan] = await this.prisma.$transaction([
      this.prisma.tenantBillingProfile.upsert({
        where: { tenantId },
        update: {},
        create: {
          tenantId,
          provider: this.config.getDefaultProvider(),
          billingEmail: null,
          currency: catalogPlan.currency,
        },
      }),
      this.prisma.tenantSubscription.upsert({
        where: { tenantId },
        update: {
          planCode: desiredCode,
          seats: effectiveSeats,
        },
        create: {
          tenantId,
          provider: this.config.getDefaultProvider(),
          status: SubscriptionStatus.trialing,
          planCode: desiredCode,
          interval: BillingInterval.monthly,
          seats: effectiveSeats,
          startedAt: new Date(),
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      }),
      this.prisma.tenantPlan.upsert({
        where: { tenantId },
        update: {
          code: desiredCode,
          seatLimit: effectiveSeats,
          status: tenant.plan?.status ?? 'active',
        },
        create: {
          tenantId,
          code: desiredCode,
          status: 'active',
          seatLimit: effectiveSeats,
        },
      }),
    ]);

    return { billingProfile, subscription, tenantPlan };
  }

  async getCurrent(tenantId: string) {
    await this.ensureTenantBillingFoundation(tenantId);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        plan: true,
        billingProfile: true,
        subscription: true,
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const catalog = await this.prisma.billingPlan.findUnique({ where: { code: tenant.plan?.code ?? tenant.subscription?.planCode ?? 'starter' } })
      ?? await this.ensurePlanExists('starter');
    const usage = await this.getUsage(tenantId);
    const effectiveLimits = this.getEffectiveLimits(catalog.defaultLimits as Record<string, unknown> | null, tenant.plan?.limits as Record<string, unknown> | null, tenant.plan?.seatLimit ?? tenant.subscription?.seats ?? catalog.includedSeats ?? null);
    const effectiveFeatures = this.mergeRecords(catalog.defaultFeatures as Record<string, unknown> | null, tenant.plan?.features as Record<string, unknown> | null);
    return {
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, status: tenant.status },
      planCatalog: catalog,
      tenantPlan: tenant.plan,
      billingProfile: tenant.billingProfile,
      subscription: tenant.subscription,
      usage,
      providerOptions: this.listProviderOptions(),
      effectiveLimits,
      effectiveFeatures,
      usageRemaining: this.computeRemaining(usage, effectiveLimits),
    };
  }

  async getUsage(tenantId: string) {
    const [stations, lines, routeStops, members, pendingInvites] = await Promise.all([
      this.prisma.station.count({ where: { tenantId } }),
      this.prisma.line.count({ where: { tenantId } }),
      this.prisma.routeStop.count({ where: { tenantId } }),
      this.prisma.tenantMembership.count({ where: { tenantId, acceptedAt: { not: null } } }),
      this.prisma.tenantInvite.count({ where: { tenantId, status: 'pending', expiresAt: { gt: new Date() } } }),
    ]);
    return {
      stations,
      lines,
      routeStops,
      members,
      pendingInvites,
      seats: members + pendingInvites,
    };
  }

  async listTenantBillingSummaries() {
    await this.seedDefaultPlans();
    const tenants = await this.prisma.tenant.findMany({
      include: { plan: true, subscription: true, billingProfile: true },
      orderBy: { createdAt: 'desc' },
    });
    const rows = [] as any[];
    for (const tenant of tenants) {
      const usage = await this.getUsage(tenant.id);
      const planCode = tenant.plan?.code ?? tenant.subscription?.planCode ?? 'starter';
      const catalog = await this.prisma.billingPlan.findUnique({ where: { code: planCode } }) ?? await this.ensurePlanExists(planCode);
      const effectiveLimits = this.getEffectiveLimits(catalog.defaultLimits as Record<string, unknown> | null, tenant.plan?.limits as Record<string, unknown> | null, tenant.plan?.seatLimit ?? tenant.subscription?.seats ?? catalog.includedSeats ?? null);
      rows.push({
        tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, status: tenant.status },
        planCode,
        planName: catalog.name,
        provider: tenant.billingProfile?.provider ?? tenant.subscription?.provider ?? this.config.getDefaultProvider(),
        subscriptionStatus: tenant.subscription?.status ?? null,
        seats: tenant.subscription?.seats ?? tenant.plan?.seatLimit ?? catalog.includedSeats ?? null,
        currency: tenant.billingProfile?.currency ?? catalog.currency,
        usage,
        effectiveLimits,
        usageRemaining: this.computeRemaining(usage, effectiveLimits),
      });
    }
    return rows;
  }

  async updateCurrentPlan(tenantId: string, input: CurrentBillingPayload) {
    await this.seedDefaultPlans();
    const code = (input.code ?? '').trim() || undefined;
    const status = (input.status ?? '').trim() || undefined;
    const provider = input.provider ?? BillingProvider.manual;
    const interval = input.interval ?? BillingInterval.monthly;
    if (code) await this.ensurePlanExists(code);
    const seatLimit = input.seatLimit ?? input.seats ?? undefined;
    if (seatLimit !== undefined && (!Number.isFinite(Number(seatLimit)) || Number(seatLimit) < 1)) {
      throw new BadRequestException('Seat limit must be a positive number');
    }
    await this.prisma.tenantPlan.upsert({
      where: { tenantId },
      update: {
        ...(code ? { code } : {}),
        ...(status ? { status } : {}),
        ...(input.limits !== undefined ? { limits: input.limits ?? Prisma.JsonNull } : {}),
        ...(input.features !== undefined ? { features: input.features ?? Prisma.JsonNull } : {}),
        ...(seatLimit !== undefined ? { seatLimit: Number(seatLimit) } : {}),
        ...(input.renewsAt !== undefined ? { renewsAt: input.renewsAt ? new Date(input.renewsAt) : null } : {}),
      },
      create: {
        tenantId,
        code: code ?? 'starter',
        status: status ?? 'active',
        seatLimit: seatLimit !== undefined ? Number(seatLimit) : undefined,
        limits: input.limits ?? undefined,
        features: input.features ?? undefined,
        renewsAt: input.renewsAt ? new Date(input.renewsAt) : undefined,
      },
    });
    await this.prisma.tenantSubscription.upsert({
      where: { tenantId },
      update: {
        ...(code ? { planCode: code } : {}),
        provider,
        interval,
        ...(input.seats !== undefined ? { seats: Number(input.seats) } : seatLimit !== undefined ? { seats: Number(seatLimit) } : {}),
        ...(input.trialEndsAt !== undefined ? { trialEndsAt: input.trialEndsAt ? new Date(input.trialEndsAt) : null } : {}),
        ...(input.currentPeriodStart !== undefined ? { currentPeriodStart: input.currentPeriodStart ? new Date(input.currentPeriodStart) : null } : {}),
        ...(input.currentPeriodEnd !== undefined ? { currentPeriodEnd: input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : null } : {}),
        ...(input.cancelAtPeriodEnd !== undefined ? { cancelAtPeriodEnd: !!input.cancelAtPeriodEnd } : {}),
        status: this.normalizeSubscriptionStatus(status),
      },
      create: {
        tenantId,
        provider,
        status: this.normalizeSubscriptionStatus(status),
        planCode: code ?? 'starter',
        interval,
        seats: Number(input.seats ?? seatLimit ?? 1),
        trialEndsAt: input.trialEndsAt ? new Date(input.trialEndsAt) : undefined,
        currentPeriodStart: input.currentPeriodStart ? new Date(input.currentPeriodStart) : undefined,
        currentPeriodEnd: input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : undefined,
        cancelAtPeriodEnd: !!input.cancelAtPeriodEnd,
        startedAt: new Date(),
      },
    });
    return this.getCurrent(tenantId);
  }

  async updateBillingProfile(tenantId: string, input: BillingProfilePayload) {
    await this.ensureTenantBillingFoundation(tenantId);
    return this.prisma.tenantBillingProfile.update({
      where: { tenantId },
      data: {
        ...(input.provider !== undefined ? { provider: input.provider } : {}),
        ...(input.billingEmail !== undefined ? { billingEmail: input.billingEmail?.trim() || null } : {}),
        ...(input.billingName !== undefined ? { billingName: input.billingName?.trim() || null } : {}),
        ...(input.countryCode !== undefined ? { countryCode: input.countryCode?.trim().toUpperCase() || null } : {}),
        ...(input.taxId !== undefined ? { taxId: input.taxId?.trim() || null } : {}),
        ...(input.currency !== undefined ? { currency: input.currency?.trim().toUpperCase() || null } : {}),
        ...(input.providerMetadata !== undefined ? { providerMetadata: input.providerMetadata ?? Prisma.JsonNull } : {}),
      },
    });
  }

  async createCheckoutSession(tenantId: string, input: Partial<CheckoutIntentInput>) {
    const current = await this.getCurrent(tenantId);
    const planCode = (input.planCode ?? current.tenantPlan?.code ?? current.subscription?.planCode ?? 'starter').trim();
    await this.ensurePlanExists(planCode);
    const interval = input.interval ?? current.subscription?.interval ?? BillingInterval.monthly;
    const seats = Math.max(1, Number(input.seats ?? current.subscription?.seats ?? current.tenantPlan?.seatLimit ?? current.planCatalog?.includedSeats ?? 1));
    const provider = this.resolveProvider(input.provider ?? current.billingProfile?.provider ?? current.subscription?.provider ?? undefined);

    if (provider === BillingProvider.manual) {
      await this.updateCurrentPlan(tenantId, {
        code: planCode,
        provider,
        interval,
        seats,
        status: SubscriptionStatus.active,
        currentPeriodStart: new Date().toISOString(),
      });
      return {
        provider,
        mode: 'manual',
        url: this.config.getPortalReturnUrl(),
        message: 'تم تطبيق الخطة يدويًا. يمكنك متابعة الإعداد من لوحة الفوترة.',
      } satisfies CheckoutSessionResult;
    }

    const checkout = provider === BillingProvider.stripe
      ? await this.stripe.createCheckoutSession({
          tenantId: current.tenant.id,
          tenantSlug: current.tenant.slug,
          tenantName: current.tenant.name,
          planCode,
          interval,
          seats,
          billingEmail: current.billingProfile?.billingEmail ?? null,
          billingName: current.billingProfile?.billingName ?? null,
          externalCustomerId: current.billingProfile?.externalCustomerId ?? null,
          successUrl: input.successUrl,
          cancelUrl: input.cancelUrl,
        })
      : await this.lemon.createCheckoutSession({
          tenantId: current.tenant.id,
          tenantSlug: current.tenant.slug,
          tenantName: current.tenant.name,
          planCode,
          interval,
          seats,
          billingEmail: current.billingProfile?.billingEmail ?? null,
          billingName: current.billingProfile?.billingName ?? null,
          successUrl: input.successUrl,
        });

    await this.prisma.$transaction([
      this.prisma.tenantBillingProfile.update({
        where: { tenantId },
        data: {
          provider,
          ...(checkout.externalCustomerId ? { externalCustomerId: checkout.externalCustomerId } : {}),
          providerMetadata: this.toJson(this.mergeRecords(
            this.asRecord(current.billingProfile?.providerMetadata),
            {
              lastCheckoutAt: new Date().toISOString(),
              lastCheckoutSessionId: checkout.externalSessionId ?? null,
            },
          )),
        },
      }),
      this.prisma.tenantSubscription.update({
        where: { tenantId },
        data: {
          provider,
          planCode,
          interval,
          seats,
          providerMetadata: this.toJson(this.mergeRecords(
            this.asRecord(current.subscription?.providerMetadata),
            {
              pendingCheckout: {
                sessionId: checkout.externalSessionId ?? null,
                planCode,
                interval,
                seats,
                url: checkout.url,
                startedAt: new Date().toISOString(),
              },
            },
          )),
        },
      }),
    ]);

    return checkout;
  }

  async createPortalSession(tenantId: string, provider?: BillingProvider) {
    const current = await this.getCurrent(tenantId);
    const resolved = this.resolveProvider(provider ?? current.billingProfile?.provider ?? current.subscription?.provider ?? undefined);
    if (resolved === BillingProvider.manual) {
      return {
        provider: resolved,
        mode: 'manual',
        url: this.config.getPortalReturnUrl(),
        message: 'الخطة الحالية تُدار يدويًا ولا يوجد portal خارجي.',
      } satisfies BillingPortalResult;
    }
    if (resolved === BillingProvider.stripe) {
      return this.stripe.createPortalSession({
        externalCustomerId: current.billingProfile?.externalCustomerId ?? null,
      });
    }
    return this.lemon.createPortalSession({
      providerMetadata: this.mergeRecords(
        this.asRecord(current.subscription?.providerMetadata),
        this.asRecord(current.billingProfile?.providerMetadata),
      ),
    });
  }

  async listCurrentWebhookEvents(tenantId: string, limit = 20) {
    return this.prisma.billingWebhookEvent.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(limit, 100)),
    });
  }

  async handleStripeWebhook(rawBody: Buffer, signature?: string | string[]) {
    return this.handleWebhook(BillingProvider.stripe, rawBody, signature);
  }

  async handleLemonWebhook(rawBody: Buffer, signature?: string | string[]) {
    return this.handleWebhook(BillingProvider.lemon_squeezy, rawBody, signature);
  }

  async assertWithinLimit(tenantId: string, metric: UsageMetric, increment = 1) {
    const current = await this.getCurrent(tenantId);
    const currentUsage = Number((current.usage as any)[metric] ?? 0);
    const limit = this.extractLimit(current.effectiveLimits?.[metric]);
    if (limit == null) return;
    if (currentUsage + increment > limit) {
      throw new BadRequestException(`Plan limit exceeded for ${metric}`);
    }
  }

  async assertSeatCapacityForInvite(tenantId: string, increment = 1) {
    const current = await this.getCurrent(tenantId);
    const currentUsage = Number(current.usage.seats ?? 0);
    const limit = this.extractLimit(current.effectiveLimits?.seats);
    if (limit == null) return;
    if (currentUsage + increment > limit) {
      throw new BadRequestException('Plan seat limit exceeded');
    }
  }

  private async handleWebhook(provider: BillingProvider, rawBody: Buffer, signature?: string | string[]) {
    const verifier = provider === BillingProvider.stripe ? this.stripe : this.lemon;
    const signatureValid = verifier.verifySignature(rawBody, signature);
    if (!signatureValid) {
      throw new BadRequestException('Invalid webhook signature');
    }
    let normalized: NormalizedBillingEvent;
    try {
      normalized = verifier.parseWebhook(rawBody);
    } catch (error: any) {
      await this.logWebhookEvent({
        provider,
        signatureValid,
        eventType: 'parse_failed',
        payload: this.parseRawBody(rawBody),
        errorMessage: error?.message ?? 'Failed to parse webhook',
        statusCode: 400,
      });
      throw new BadRequestException('Invalid webhook payload');
    }

    const existing = normalized.externalEventId
      ? await this.prisma.billingWebhookEvent.findFirst({ where: { provider, externalEventId: normalized.externalEventId } })
      : null;
    if (existing?.processed) {
      return { received: true, duplicate: true };
    }

    const eventId = existing?.id ?? randomUUID();
    await this.logWebhookEvent({
      id: eventId,
      provider,
      externalEventId: normalized.externalEventId ?? null,
      tenantId: normalized.tenantId ?? null,
      eventType: normalized.eventType,
      signatureValid,
      payload: normalized.payload,
      statusCode: null,
      errorMessage: null,
      processed: false,
    });

    try {
      const applied = await this.applyNormalizedBillingEvent(normalized, eventId);
      await this.logWebhookEvent({
        id: eventId,
        provider,
        externalEventId: normalized.externalEventId ?? null,
        tenantId: applied.tenantId ?? normalized.tenantId ?? null,
        eventType: normalized.eventType,
        signatureValid,
        payload: normalized.payload,
        statusCode: 200,
        processed: true,
        processedAt: new Date(),
        errorMessage: applied.applied ? null : applied.reason ?? null,
      });
      return { received: true, applied };
    } catch (error: any) {
      await this.logWebhookEvent({
        id: eventId,
        provider,
        externalEventId: normalized.externalEventId ?? null,
        tenantId: normalized.tenantId ?? null,
        eventType: normalized.eventType,
        signatureValid,
        payload: normalized.payload,
        statusCode: 500,
        processed: false,
        errorMessage: error?.message ?? 'Webhook processing failed',
      });
      throw error;
    }
  }

  private async applyNormalizedBillingEvent(event: NormalizedBillingEvent, eventId: string) {
    const tenantId = await this.resolveTenantIdForEvent(event);
    if (!tenantId) {
      return { applied: false, tenantId: null, reason: 'Tenant could not be resolved for billing event' };
    }

    const [tenant, currentProfile, currentSubscription, currentPlan] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId } }),
      this.prisma.tenantBillingProfile.findUnique({ where: { tenantId } }),
      this.prisma.tenantSubscription.findUnique({ where: { tenantId } }),
      this.prisma.tenantPlan.findUnique({ where: { tenantId } }),
    ]);
    if (!tenant) return { applied: false, tenantId, reason: 'Resolved tenant not found' };

    const providerMetadata = this.mergeRecords(
      this.asRecord(currentSubscription?.providerMetadata),
      {
        ...(event.portalUrl ? { portalUrl: event.portalUrl } : {}),
        ...(event.invoiceUrl ? { lastInvoiceUrl: event.invoiceUrl } : {}),
        lastEventType: event.eventType,
        lastEventAt: new Date().toISOString(),
      },
    );
    const profileMetadata = this.mergeRecords(
      this.asRecord(currentProfile?.providerMetadata),
      {
        ...(event.portalUrl ? { portalUrl: event.portalUrl } : {}),
        ...(event.invoiceUrl ? { lastInvoiceUrl: event.invoiceUrl } : {}),
        lastProviderSyncAt: new Date().toISOString(),
      },
    );

    const subscriptionStatus = event.status ?? currentSubscription?.status ?? SubscriptionStatus.active;
    const planCode = event.planCode ?? currentSubscription?.planCode ?? currentPlan?.code ?? 'starter';
    const interval = event.interval ?? currentSubscription?.interval ?? BillingInterval.monthly;
    const seats = Number(event.seats ?? currentSubscription?.seats ?? currentPlan?.seatLimit ?? 1);

    await this.ensurePlanExists(planCode);

    await this.prisma.$transaction([
      this.prisma.tenantBillingProfile.upsert({
        where: { tenantId },
        update: {
          provider: event.provider,
          ...(event.customerId ? { externalCustomerId: event.customerId } : {}),
          ...(event.billingEmail !== undefined ? { billingEmail: event.billingEmail } : {}),
          ...(event.billingName !== undefined ? { billingName: event.billingName } : {}),
          providerMetadata: this.toJson(profileMetadata),
        },
        create: {
          tenantId,
          provider: event.provider,
          externalCustomerId: event.customerId ?? undefined,
          billingEmail: event.billingEmail ?? undefined,
          billingName: event.billingName ?? undefined,
          currency: 'USD',
          providerMetadata: this.toJson(profileMetadata),
        },
      }),
      this.prisma.tenantSubscription.upsert({
        where: { tenantId },
        update: {
          provider: event.provider,
          ...(event.subscriptionId ? { externalSubscriptionId: event.subscriptionId } : {}),
          status: subscriptionStatus,
          planCode,
          interval,
          seats,
          ...(event.currentPeriodStart !== undefined ? { currentPeriodStart: event.currentPeriodStart } : {}),
          ...(event.currentPeriodEnd !== undefined ? { currentPeriodEnd: event.currentPeriodEnd } : {}),
          ...(event.trialEndsAt !== undefined ? { trialEndsAt: event.trialEndsAt } : {}),
          ...(event.cancelAtPeriodEnd !== undefined && event.cancelAtPeriodEnd !== null ? { cancelAtPeriodEnd: event.cancelAtPeriodEnd } : {}),
          lastWebhookEventId: event.externalEventId ?? eventId,
          lastWebhookAt: new Date(),
          providerMetadata: this.toJson(providerMetadata),
        },
        create: {
          tenantId,
          provider: event.provider,
          externalSubscriptionId: event.subscriptionId ?? undefined,
          status: subscriptionStatus,
          planCode,
          interval,
          seats,
          startedAt: new Date(),
          currentPeriodStart: event.currentPeriodStart ?? undefined,
          currentPeriodEnd: event.currentPeriodEnd ?? undefined,
          trialEndsAt: event.trialEndsAt ?? undefined,
          cancelAtPeriodEnd: event.cancelAtPeriodEnd ?? false,
          lastWebhookEventId: event.externalEventId ?? eventId,
          lastWebhookAt: new Date(),
          providerMetadata: this.toJson(providerMetadata),
        },
      }),
      this.prisma.tenantPlan.upsert({
        where: { tenantId },
        update: {
          code: planCode,
          status: subscriptionStatus,
          seatLimit: seats,
          renewsAt: event.currentPeriodEnd ?? currentPlan?.renewsAt ?? null,
        },
        create: {
          tenantId,
          code: planCode,
          status: subscriptionStatus,
          seatLimit: seats,
          renewsAt: event.currentPeriodEnd ?? undefined,
        },
      }),
    ]);

    return { applied: true, tenantId };
  }

  private async resolveTenantIdForEvent(event: NormalizedBillingEvent) {
    if (event.tenantId) return event.tenantId;
    if (event.subscriptionId) {
      const sub = await this.prisma.tenantSubscription.findFirst({ where: { externalSubscriptionId: event.subscriptionId } });
      if (sub) return sub.tenantId;
    }
    if (event.customerId) {
      const profile = await this.prisma.tenantBillingProfile.findFirst({ where: { externalCustomerId: event.customerId } });
      if (profile) return profile.tenantId;
    }
    return null;
  }

  private async logWebhookEvent(input: {
    id?: string;
    provider: BillingProvider;
    externalEventId?: string | null;
    tenantId?: string | null;
    eventType: string;
    signatureValid: boolean;
    payload: unknown;
    statusCode?: number | null;
    processed?: boolean;
    processedAt?: Date | null;
    errorMessage?: string | null;
  }): Promise<BillingWebhookEvent> {
    const existing = input.externalEventId
      ? await this.prisma.billingWebhookEvent.findFirst({ where: { provider: input.provider, externalEventId: input.externalEventId } })
      : null;
    if (existing) {
      return this.prisma.billingWebhookEvent.update({
        where: { id: existing.id },
        data: {
          tenantId: input.tenantId ?? existing.tenantId,
          eventType: input.eventType,
          signatureValid: input.signatureValid,
          payload: input.payload as Prisma.InputJsonValue,
          statusCode: input.statusCode ?? existing.statusCode,
          processed: input.processed ?? existing.processed,
          processedAt: input.processedAt ?? existing.processedAt,
          errorMessage: input.errorMessage ?? null,
        },
      });
    }
    return this.prisma.billingWebhookEvent.create({
      data: {
        id: input.id ?? randomUUID(),
        tenantId: input.tenantId ?? undefined,
        provider: input.provider,
        externalEventId: input.externalEventId ?? undefined,
        eventType: input.eventType,
        signatureValid: input.signatureValid,
        payload: input.payload as Prisma.InputJsonValue,
        statusCode: input.statusCode ?? undefined,
        processed: input.processed ?? false,
        processedAt: input.processedAt ?? undefined,
        errorMessage: input.errorMessage ?? undefined,
      },
    });
  }

  private parseRawBody(rawBody: Buffer) {
    try {
      return JSON.parse(rawBody.toString('utf8'));
    } catch {
      return { raw: rawBody.toString('utf8') };
    }
  }

  private resolveProvider(provider?: BillingProvider | null) {
    if (provider && provider !== BillingProvider.manual) return provider;
    if (provider === BillingProvider.manual) return provider;
    return this.config.getDefaultProvider();
  }

  private async ensurePlanExists(code: string) {
    const existing = await this.prisma.billingPlan.findUnique({ where: { code } });
    if (existing) return existing;
    const fallback = DEFAULT_BILLING_PLANS.find((p) => p.code === code);
    if (fallback) {
      return this.prisma.billingPlan.create({
        data: {
          code: fallback.code,
          name: fallback.name,
          description: fallback.description ?? null,
          currency: fallback.currency,
          monthlyPriceMinor: fallback.monthlyPriceMinor,
          yearlyPriceMinor: fallback.yearlyPriceMinor,
          includedSeats: fallback.includedSeats,
          defaultLimits: fallback.defaultLimits,
          defaultFeatures: fallback.defaultFeatures,
          isPublic: fallback.isPublic,
          sortOrder: fallback.sortOrder,
        },
      });
    }
    return this.prisma.billingPlan.create({
      data: {
        code,
        name: `Custom · ${code}`,
        description: 'Seeded automatically for backward compatibility.',
        currency: 'USD',
        isPublic: false,
        sortOrder: 999,
      },
    });
  }

  async getEntitlements(tenantId: string) {
    const current = await this.getCurrent(tenantId);
    return {
      tenant: current.tenant,
      planCode: current.tenantPlan?.code ?? current.subscription?.planCode ?? current.planCatalog?.code ?? 'starter',
      effectiveFeatures: normalizeFeatureMap(current.effectiveFeatures),
      effectiveLimits: current.effectiveLimits,
      usage: current.usage,
      usageRemaining: current.usageRemaining,
      featureCatalog: BILLING_FEATURE_CATALOG.map((item) => ({
        ...item,
        key: item.key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
      })),
    };
  }

  async isFeatureEnabled(tenantId: string, feature: BillingFeatureKey) {
    const current = await this.getCurrent(tenantId);
    return normalizeFeatureMap(current.effectiveFeatures)[feature] === true;
  }

  async assertFeatureEnabled(tenantId: string, feature: BillingFeatureKey) {
    const enabled = await this.isFeatureEnabled(tenantId, feature);
    if (!enabled) {
      throw new ForbiddenException(`Feature not enabled for current tenant: ${feature}`);
    }
  }

  private normalizeSubscriptionStatus(status?: string) {
    switch (status) {
      case 'trialing':
      case 'active':
      case 'past_due':
      case 'paused':
      case 'canceled':
      case 'expired':
        return status as SubscriptionStatus;
      default:
        return SubscriptionStatus.active;
    }
  }

  private mergeRecords(a: Record<string, unknown> | null | undefined, b: Record<string, unknown> | null | undefined) {
    return { ...(a ?? {}), ...(b ?? {}) };
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  }

  private toJson(record: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | undefined {
    if (!record) return undefined;
    return record as Prisma.InputJsonValue;
  }

  private getEffectiveLimits(
    defaultLimits: Record<string, unknown> | null | undefined,
    overrides: Record<string, unknown> | null | undefined,
    seatLimit: number | null,
  ) {
    const merged = this.mergeRecords(defaultLimits, overrides);
    if (seatLimit !== null && seatLimit !== undefined) merged.seats = seatLimit;
    return merged;
  }

  private extractLimit(value: unknown): number | null {
    if (value === null || value === undefined || value === '' || value === false) return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  }

  private computeRemaining(usage: Record<string, number>, effectiveLimits: Record<string, unknown>) {
    const out: Record<string, number | null> = {};
    for (const [metric, used] of Object.entries(usage)) {
      const limit = this.extractLimit(effectiveLimits?.[metric]);
      out[metric] = limit == null ? null : Math.max(0, limit - used);
    }
    return out;
  }
}
