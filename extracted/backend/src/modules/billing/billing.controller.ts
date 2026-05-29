import { BadRequestException, Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AppRole, BillingInterval, BillingProvider, TenantRole } from '@prisma/client';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequiredTenantContextGuard } from '../../common/tenancy/tenant-context.guard';
import { BillingService } from './billing.service';
import { UpdateBillingProfileDto, UpdateCurrentPlanDto } from './billing.dto';

@Controller('billing')
export class BillingController {
  constructor(private readonly service: BillingService) {}

  @Get('plans')
  listPlans() {
    return this.service.listPlans();
  }

  @UseGuards(JwtAuthGuard)
  @Get('providers')
  listProviderOptions() {
    return this.service.listProviderOptions();
  }

  @UseGuards(JwtAuthGuard, RequiredTenantContextGuard)
  @Get('current')
  current(@CurrentTenant() tenant: { id: string }) {
    return this.service.getCurrent(tenant.id);
  }

  @UseGuards(JwtAuthGuard, RequiredTenantContextGuard)
  @Get('current/entitlements')
  currentEntitlements(@CurrentTenant() tenant: { id: string }) {
    return this.service.getEntitlements(tenant.id);
  }

  @UseGuards(JwtAuthGuard, RequiredTenantContextGuard)
  @Get('current/usage')
  usage(@CurrentTenant() tenant: { id: string }) {
    return this.service.getUsage(tenant.id);
  }

  @UseGuards(JwtAuthGuard, RequiredTenantContextGuard)
  @Get('current/webhooks')
  currentWebhooks(@CurrentTenant() tenant: { id: string }) {
    return this.service.listCurrentWebhookEvents(tenant.id);
  }

  @UseGuards(JwtAuthGuard, RequiredTenantContextGuard)
  @Patch('current/plan')
  updateCurrentPlan(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: AuthUser,
    @Body()
    body: UpdateCurrentPlanDto,
  ) {
    this.assertCanManage(user);
    return this.service.updateCurrentPlan(tenant.id, body);
  }

  @UseGuards(JwtAuthGuard, RequiredTenantContextGuard)
  @Patch('current/profile')
  updateCurrentProfile(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: AuthUser,
    @Body()
    body: UpdateBillingProfileDto,
  ) {
    this.assertCanManage(user);
    return this.service.updateBillingProfile(tenant.id, body);
  }

  @UseGuards(JwtAuthGuard, RequiredTenantContextGuard)
  @Post('current/checkout')
  createCheckoutSession(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: AuthUser,
    @Body() body: {
      planCode?: string;
      interval?: BillingInterval;
      seats?: number;
      provider?: BillingProvider;
      successUrl?: string | null;
      cancelUrl?: string | null;
    },
  ) {
    this.assertCanManage(user);
    return this.service.createCheckoutSession(tenant.id, {
      planCode: body.planCode ?? 'starter',
      interval: body.interval ?? BillingInterval.monthly,
      seats: Number(body.seats ?? 1),
      provider: body.provider,
      successUrl: body.successUrl,
      cancelUrl: body.cancelUrl,
    });
  }

  @UseGuards(JwtAuthGuard, RequiredTenantContextGuard)
  @Post('current/portal')
  createPortalSession(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: AuthUser,
    @Body() body: { provider?: BillingProvider } = {},
  ) {
    this.assertCanManage(user);
    return this.service.createPortalSession(tenant.id, body.provider);
  }

  @Post('webhooks/stripe')
  async stripeWebhook(@Req() req: Request & { rawBody?: Buffer }) {
    const rawBody = req.rawBody;
    if (!rawBody) throw new BadRequestException('Missing raw body for Stripe webhook verification');
    const signature = req.headers['stripe-signature'];
    return this.service.handleStripeWebhook(rawBody, signature);
  }

  @Post('webhooks/lemon-squeezy')
  async lemonWebhook(@Req() req: Request & { rawBody?: Buffer }) {
    const rawBody = req.rawBody;
    if (!rawBody) throw new BadRequestException('Missing raw body for Lemon Squeezy webhook verification');
    const signature = req.headers['x-signature'];
    return this.service.handleLemonWebhook(rawBody, signature);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.platform_owner, AppRole.platform_admin)
  @Get('admin/summary')
  adminSummary() {
    return this.service.listTenantBillingSummaries();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.platform_owner, AppRole.platform_admin)
  @Post('admin/seed-defaults')
  seedDefaults() {
    return this.service.seedDefaultPlans();
  }

  private assertCanManage(user: AuthUser) {
    const tenantRole = user.currentTenantRole;
    const platformRoles = user.platformRoles ?? [];
    const allowedTenantRoles: TenantRole[] = [TenantRole.tenant_owner, TenantRole.tenant_admin];
    const allowedPlatformRoles: AppRole[] = [AppRole.platform_owner, AppRole.platform_admin];
    if (tenantRole && allowedTenantRoles.includes(tenantRole)) return;
    if (platformRoles.some((r) => allowedPlatformRoles.includes(r))) return;
    throw new BadRequestException('You do not have permission to manage billing for this tenant');
  }
}
