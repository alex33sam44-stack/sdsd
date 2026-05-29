import 'dotenv/config';
import { BillingInterval, BillingProvider, PrismaClient, SubscriptionStatus } from '@prisma/client';
import { DEFAULT_BILLING_PLANS } from '../src/modules/billing/default-plans';

const prisma = new PrismaClient();

async function ensurePlans() {
  for (const plan of DEFAULT_BILLING_PLANS) {
    await prisma.billingPlan.upsert({
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

async function ensurePlanCode(code: string) {
  const found = await prisma.billingPlan.findUnique({ where: { code } });
  if (found) return found;
  return prisma.billingPlan.create({
    data: {
      code,
      name: `Custom · ${code}`,
      description: 'Backfilled automatically during billing foundation seeding.',
      currency: 'USD',
      isPublic: false,
      sortOrder: 999,
    },
  });
}

async function backfillTenants() {
  const tenants = await prisma.tenant.findMany({ include: { plan: true, subscription: true, billingProfile: true } });
  for (const tenant of tenants) {
    const code = tenant.plan?.code ?? tenant.subscription?.planCode ?? 'starter';
    const plan = await ensurePlanCode(code);
    const seats = tenant.plan?.seatLimit ?? tenant.subscription?.seats ?? plan.includedSeats ?? 1;

    await prisma.tenantBillingProfile.upsert({
      where: { tenantId: tenant.id },
      update: {
        provider: tenant.billingProfile?.provider ?? BillingProvider.manual,
        currency: tenant.billingProfile?.currency ?? plan.currency,
      },
      create: {
        tenantId: tenant.id,
        provider: BillingProvider.manual,
        currency: plan.currency,
      },
    });

    await prisma.tenantSubscription.upsert({
      where: { tenantId: tenant.id },
      update: {
        planCode: code,
        seats,
      },
      create: {
        tenantId: tenant.id,
        provider: BillingProvider.manual,
        status: SubscriptionStatus.active,
        planCode: code,
        interval: BillingInterval.monthly,
        seats,
        startedAt: new Date(),
        currentPeriodStart: new Date(),
        currentPeriodEnd: tenant.plan?.renewsAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.tenantPlan.upsert({
      where: { tenantId: tenant.id },
      update: {
        code,
        seatLimit: seats,
      },
      create: {
        tenantId: tenant.id,
        code,
        status: 'active',
        seatLimit: seats,
      },
    });

    console.log(`Backfilled billing foundation for tenant ${tenant.slug} (${tenant.id}) -> ${code}`);
  }
}

async function main() {
  console.log('Seeding billing plans...');
  await ensurePlans();
  console.log('Backfilling tenant billing profile/subscription...');
  await backfillTenants();
  console.log('Done.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
