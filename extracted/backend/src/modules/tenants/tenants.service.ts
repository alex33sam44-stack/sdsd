import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BillingInterval, BillingProvider, SubscriptionStatus, TenantRole, TenantStatus, TenantInviteStatus } from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BillingService } from '../billing/billing.service';

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || `tenant-${randomUUID().slice(0, 8)}`;
}

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService, private readonly billing: BillingService) {}

  async createTenant(userId: string, input: { name: string; slug?: string }) {
    await this.billing.seedDefaultPlans();
    const slug = slugify(input.slug || input.name);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.tenant.findUnique({ where: { slug } });
      if (existing) throw new BadRequestException('Tenant slug already exists');
      const tenant = await tx.tenant.create({
        data: {
          id: randomUUID(),
          name: input.name.trim(),
          slug,
          settings: { create: { locale: 'ar', timezone: 'Africa/Cairo' } },
          plan: { create: { code: 'starter', status: 'active', seatLimit: 3 } },
          billingProfile: { create: { provider: BillingProvider.manual, currency: 'USD' } },
          subscription: {
            create: {
              provider: BillingProvider.manual,
              status: SubscriptionStatus.trialing,
              planCode: 'starter',
              interval: BillingInterval.monthly,
              seats: 3,
              startedAt: new Date(),
              trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            },
          },
        },
      });
      await tx.tenantMembership.create({
        data: {
          id: randomUUID(),
          tenantId: tenant.id,
          userId,
          role: TenantRole.tenant_owner,
          acceptedAt: new Date(),
        },
      });
      return tenant;
    });
  }

  listMyMemberships(userId: string) {
    return this.prisma.tenantMembership.findMany({
      where: { userId, acceptedAt: { not: null } },
      include: {
        tenant: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  listTenants() {
    return this.prisma.tenant.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async listMembers(tenantId: string) {
    await this.billing.assertFeatureEnabled(tenantId, 'teamManagement');
    return this.prisma.tenantMembership.findMany({
      where: { tenantId },
      include: {
        user: {
          include: { profile: true, roles: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listInvites(tenantId: string) {
    await this.billing.assertFeatureEnabled(tenantId, 'teamManagement');
    return this.prisma.tenantInvite.findMany({
      where: { tenantId, status: TenantInviteStatus.pending },
      orderBy: { createdAt: 'desc' },
    });
  }

  async invite(tenantId: string, inviterId: string, input: { email: string; role: TenantRole; expiresInDays?: number }) {
    await this.billing.assertFeatureEnabled(tenantId, 'teamManagement');
    await this.billing.assertSeatCapacityForInvite(tenantId);
    const email = input.email.trim().toLowerCase();
    const expiresInDays = Math.max(1, Math.min(30, input.expiresInDays ?? 7));
    const token = randomBytes(24).toString('base64url');

    const existingMembership = await this.prisma.tenantMembership.findFirst({
      where: { tenantId, user: { email }, acceptedAt: { not: null } },
      include: { user: true },
    });
    if (existingMembership) {
      throw new BadRequestException('User is already a member of this tenant');
    }

    const existingInvite = await this.prisma.tenantInvite.findFirst({
      where: { tenantId, email, status: TenantInviteStatus.pending, expiresAt: { gt: new Date() } },
    });
    if (existingInvite) {
      throw new BadRequestException('A pending invitation already exists for this email');
    }

    const invite = await this.prisma.tenantInvite.create({
      data: {
        id: randomUUID(),
        tenantId,
        invitedById: inviterId,
        email,
        role: input.role,
        token,
        expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
      },
      include: { tenant: true },
    });
    return invite;
  }

  async acceptInvite(token: string, userId: string) {
    const invite = await this.prisma.tenantInvite.findUnique({
      where: { token },
      include: { tenant: true },
    });
    if (!invite || invite.status !== TenantInviteStatus.pending) {
      throw new NotFoundException('Invitation not found');
    }
    if (invite.expiresAt < new Date()) {
      await this.prisma.tenantInvite.update({ where: { id: invite.id }, data: { status: TenantInviteStatus.expired } }).catch(() => undefined);
      throw new BadRequestException('Invitation expired');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new BadRequestException('Invitation email does not match current user');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.tenantMembership.upsert({
        where: { tenantId_userId: { tenantId: invite.tenantId, userId } },
        update: { role: invite.role, acceptedAt: new Date() },
        create: {
          id: randomUUID(),
          tenantId: invite.tenantId,
          userId,
          role: invite.role,
          acceptedAt: new Date(),
        },
      });
      await tx.tenantInvite.update({
        where: { id: invite.id },
        data: { status: TenantInviteStatus.accepted, acceptedAt: new Date() },
      });
      return tx.tenant.findUnique({ where: { id: invite.tenantId } });
    });
  }

  async revokeInvite(tenantId: string, inviteId: string) {
    await this.billing.assertFeatureEnabled(tenantId, 'teamManagement');
    const invite = await this.prisma.tenantInvite.findFirst({ where: { id: inviteId, tenantId } });
    if (!invite) throw new NotFoundException('Invitation not found');
    if (invite.status !== TenantInviteStatus.pending) {
      throw new BadRequestException('Only pending invitations can be revoked');
    }
    return this.prisma.tenantInvite.update({ where: { id: invite.id }, data: { status: TenantInviteStatus.revoked } });
  }

  private async ensureTenantHasAnotherOwner(tenantId: string, userId: string) {
    const ownerCount = await this.prisma.tenantMembership.count({
      where: { tenantId, role: TenantRole.tenant_owner, acceptedAt: { not: null } },
    });
    const membership = await this.prisma.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId, userId } } });
    if (membership?.role === TenantRole.tenant_owner && ownerCount <= 1) {
      throw new BadRequestException('Tenant must retain at least one tenant_owner');
    }
  }

  async changeMemberRole(tenantId: string, userId: string, role: TenantRole) {
    await this.billing.assertFeatureEnabled(tenantId, 'teamManagement');
    const membership = await this.prisma.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId, userId } } });
    if (!membership) throw new NotFoundException('Membership not found');
    if (membership.role === TenantRole.tenant_owner && role !== TenantRole.tenant_owner) {
      await this.ensureTenantHasAnotherOwner(tenantId, userId);
    }
    return this.prisma.tenantMembership.update({
      where: { tenantId_userId: { tenantId, userId } },
      data: { role, acceptedAt: membership.acceptedAt ?? new Date() },
    });
  }

  async removeMember(tenantId: string, userId: string) {
    await this.billing.assertFeatureEnabled(tenantId, 'teamManagement');
    await this.ensureTenantHasAnotherOwner(tenantId, userId);
    await this.prisma.tenantMembership.deleteMany({ where: { tenantId, userId } });
  }

  async setStatus(tenantId: string, status: TenantStatus) {
    return this.prisma.tenant.update({ where: { id: tenantId }, data: { status } });
  }
}
