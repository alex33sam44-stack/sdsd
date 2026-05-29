import 'dotenv/config';
import { AppRole, PrismaClient, TenantRole, TenantStatus } from '@prisma/client';

const prisma = new PrismaClient();

const LEGACY_TENANT_SLUG = process.env.LEGACY_TENANT_SLUG ?? 'legacy-default';
const LEGACY_TENANT_NAME = process.env.LEGACY_TENANT_NAME ?? 'Legacy Default Tenant';
const LEGACY_TENANT_COUNTRY_CODE = process.env.LEGACY_TENANT_COUNTRY_CODE ?? undefined;
const LEGACY_TENANT_PLAN_CODE = process.env.LEGACY_TENANT_PLAN_CODE ?? 'legacy';
const LEGACY_TENANT_PLAN_STATUS = process.env.LEGACY_TENANT_PLAN_STATUS ?? 'active';

type MembershipSeed = {
  userId: string;
  role: TenantRole;
};

function mapPlatformRoleToTenantRole(role?: AppRole | null): TenantRole {
  switch (role) {
    case AppRole.platform_admin:
      return TenantRole.tenant_owner;
    case AppRole.station_operator:
      return TenantRole.station_manager;
    case AppRole.passenger:
    default:
      return TenantRole.viewer;
  }
}

async function ensureTenant() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: LEGACY_TENANT_SLUG },
    update: { name: LEGACY_TENANT_NAME, status: TenantStatus.active },
    create: {
      slug: LEGACY_TENANT_SLUG,
      name: LEGACY_TENANT_NAME,
      status: TenantStatus.active,
      settings: {
        create: {
          locale: 'ar',
          timezone: 'Africa/Cairo',
          countryCode: LEGACY_TENANT_COUNTRY_CODE,
        },
      },
      plan: {
        create: {
          code: LEGACY_TENANT_PLAN_CODE,
          status: LEGACY_TENANT_PLAN_STATUS,
        },
      },
    },
  });

  await prisma.tenantSettings.upsert({
    where: { tenantId: tenant.id },
    update: {
      countryCode: LEGACY_TENANT_COUNTRY_CODE,
      locale: 'ar',
      timezone: 'Africa/Cairo',
    },
    create: {
      tenantId: tenant.id,
      countryCode: LEGACY_TENANT_COUNTRY_CODE,
      locale: 'ar',
      timezone: 'Africa/Cairo',
    },
  });

  await prisma.tenantPlan.upsert({
    where: { tenantId: tenant.id },
    update: {
      code: LEGACY_TENANT_PLAN_CODE,
      status: LEGACY_TENANT_PLAN_STATUS,
    },
    create: {
      tenantId: tenant.id,
      code: LEGACY_TENANT_PLAN_CODE,
      status: LEGACY_TENANT_PLAN_STATUS,
    },
  });

  return tenant;
}

async function backfillTenantIds(tenantId: string) {
  const results = await Promise.all([
    prisma.city.updateMany({ where: { tenantId: null }, data: { tenantId } }),
    prisma.station.updateMany({ where: { tenantId: null }, data: { tenantId } }),
    prisma.stationLayout.updateMany({ where: { tenantId: null }, data: { tenantId } }),
    prisma.layoutZone.updateMany({ where: { tenantId: null }, data: { tenantId } }),
    prisma.line.updateMany({ where: { tenantId: null }, data: { tenantId } }),
    prisma.routeStop.updateMany({ where: { tenantId: null }, data: { tenantId } }),
    prisma.favorite.updateMany({ where: { tenantId: null }, data: { tenantId } }),
    prisma.searchLog.updateMany({ where: { tenantId: null }, data: { tenantId } }),
    prisma.auditLog.updateMany({ where: { tenantId: null }, data: { tenantId } }),
    prisma.draftChange.updateMany({ where: { tenantId: null }, data: { tenantId } }),
    prisma.availabilityLog.updateMany({ where: { tenantId: null }, data: { tenantId } }),
  ]);

  const labels = [
    'cities',
    'stations',
    'station_layouts',
    'layout_zones',
    'lines',
    'route_stops',
    'favorites',
    'search_logs',
    'audit_logs',
    'draft_changes',
    'availability_logs',
  ] as const;

  for (const [index, result] of results.entries()) {
    console.log(`  ${labels[index]}: backfilled ${result.count}`);
  }
}

async function ensureMemberships(tenantId: string) {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      roles: { select: { role: true } },
      tenantMemberships: {
        where: { tenantId },
        select: { id: true },
      },
    },
  });

  const membershipSeeds: MembershipSeed[] = [];
  for (const user of users) {
    if (user.tenantMemberships.length > 0) continue;

    const roles = user.roles.map((r) => r.role);
    const role = roles.includes(AppRole.platform_admin)
      ? TenantRole.tenant_owner
      : roles.includes(AppRole.station_operator)
        ? TenantRole.station_manager
        : roles.includes(AppRole.passenger)
          ? TenantRole.viewer
          : mapPlatformRoleToTenantRole(null);

    membershipSeeds.push({ userId: user.id, role });
  }

  if (membershipSeeds.length === 0) {
    console.log('  tenant_memberships: nothing to backfill');
    return;
  }

  await prisma.tenantMembership.createMany({
    data: membershipSeeds.map((item) => ({
      tenantId,
      userId: item.userId,
      role: item.role,
      acceptedAt: new Date(),
    })),
    skipDuplicates: true,
  });

  console.log(`  tenant_memberships: created ${membershipSeeds.length}`);
}

async function printCoverage(tenantId: string) {
  const [
    cities,
    stations,
    layouts,
    zones,
    lines,
    stops,
    favorites,
    searchLogs,
    auditLogs,
    drafts,
    availability,
    memberships,
  ] = await Promise.all([
    prisma.city.count({ where: { tenantId } }),
    prisma.station.count({ where: { tenantId } }),
    prisma.stationLayout.count({ where: { tenantId } }),
    prisma.layoutZone.count({ where: { tenantId } }),
    prisma.line.count({ where: { tenantId } }),
    prisma.routeStop.count({ where: { tenantId } }),
    prisma.favorite.count({ where: { tenantId } }),
    prisma.searchLog.count({ where: { tenantId } }),
    prisma.auditLog.count({ where: { tenantId } }),
    prisma.draftChange.count({ where: { tenantId } }),
    prisma.availabilityLog.count({ where: { tenantId } }),
    prisma.tenantMembership.count({ where: { tenantId } }),
  ]);

  console.log('\nCoverage report');
  console.log(`  tenant_id: ${tenantId}`);
  console.log(`  cities: ${cities}`);
  console.log(`  stations: ${stations}`);
  console.log(`  station_layouts: ${layouts}`);
  console.log(`  layout_zones: ${zones}`);
  console.log(`  lines: ${lines}`);
  console.log(`  route_stops: ${stops}`);
  console.log(`  favorites: ${favorites}`);
  console.log(`  search_logs: ${searchLogs}`);
  console.log(`  audit_logs: ${auditLogs}`);
  console.log(`  draft_changes: ${drafts}`);
  console.log(`  availability_logs: ${availability}`);
  console.log(`  tenant_memberships: ${memberships}`);
}

async function main() {
  console.log('Ensuring legacy tenant foundation...');
  const tenant = await ensureTenant();
  console.log(`  tenant: ${tenant.slug} (${tenant.id})`);

  console.log('Backfilling tenant_id across legacy data...');
  await backfillTenantIds(tenant.id);

  console.log('Creating tenant memberships for existing users...');
  await ensureMemberships(tenant.id);

  await printCoverage(tenant.id);
  console.log('\nDone. Next step: once runtime tenant scoping is enforced, make tenant_id required in a follow-up migration.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
