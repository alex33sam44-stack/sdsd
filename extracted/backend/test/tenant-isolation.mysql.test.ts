import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { StationsService } from '../src/modules/stations/stations.service';

const runMysqlTenantIsolation = process.env.RUN_MYSQL_TENANT_ISOLATION === '1';
const describeMysql = runMysqlTenantIsolation ? describe : describe.skip;

function requireMysqlDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for the MySQL tenant isolation integration test.');
  }
  if (!databaseUrl.startsWith('mysql://')) {
    throw new Error(`DATABASE_URL must point to a real MySQL database. Received: ${databaseUrl.split(':')[0] || 'unknown'}://...`);
  }
}

describeMysql('tenant isolation on real MySQL', () => {
  const prisma = new PrismaClient();
  const suffix = randomUUID().slice(0, 8);
  const tenantSlugs = [`tenant-isolation-a-${suffix}`, `tenant-isolation-b-${suffix}`];
  const stationsService = new StationsService(
    prisma as never,
    { assertWithinLimit: jest.fn().mockResolvedValue(undefined) } as never,
  );

  beforeAll(async () => {
    requireMysqlDatabaseUrl();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { in: tenantSlugs } } });
    await prisma.$disconnect();
  });

  it('prevents one tenant from reading another tenant station and line data', async () => {
    const orgA = await prisma.tenant.create({ data: { slug: tenantSlugs[0], name: 'Tenant Isolation A' } });
    const orgB = await prisma.tenant.create({ data: { slug: tenantSlugs[1], name: 'Tenant Isolation B' } });

    const stationA = await prisma.station.create({
      data: {
        tenantId: orgA.id,
        name: `Tenant A Station ${suffix}`,
        area: 'A-only',
        lat: 30.0444,
        lng: 31.2357,
        isPublished: true,
      },
    });

    await prisma.line.create({
      data: {
        tenantId: orgA.id,
        stationId: stationA.id,
        destination: `Tenant A Destination ${suffix}`,
        isPublished: true,
      },
    });

    const unscopedStations = await prisma.station.findMany({ where: { id: stationA.id } });
    expect(unscopedStations).toHaveLength(1);

    const tenantBStations = await stationsService.listAll(orgB.id);
    expect(tenantBStations).toHaveLength(0);

    const tenantBPublishedStations = await stationsService.listPublished(orgB.id);
    expect(tenantBPublishedStations).toHaveLength(0);

    await expect(stationsService.getWithLines(stationA.id, orgB.id, true)).rejects.toBeInstanceOf(NotFoundException);

    const tenantBLines = await prisma.line.findMany({ where: { tenantId: orgB.id } });
    expect(tenantBLines).toHaveLength(0);
  });
});
