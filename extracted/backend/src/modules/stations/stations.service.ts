import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BillingService } from '../billing/billing.service';

@Injectable()
export class StationsService {
  constructor(private readonly prisma: PrismaService, private readonly billing: BillingService) {}

  listPublished(tenantId: string) {
    return this.prisma.station.findMany({
      where: { tenantId, isPublished: true },
      orderBy: { name: 'asc' },
    });
  }

  listAll(tenantId: string) {
    return this.prisma.station.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }

  async getWithLines(id: string, tenantId: string, includeUnpublished = false) {
    const station = await this.prisma.station.findFirst({
      where: { id, tenantId },
      include: {
        lines: {
          where: { tenantId, ...(includeUnpublished ? {} : { isPublished: true }) },
          include: { stops: { where: { tenantId }, orderBy: { position: 'asc' } } },
          orderBy: { destination: 'asc' },
        },
      },
    });
    if (!station) throw new NotFoundException('Station not found');
    return station;
  }

  async create(tenantId: string, data: { name: string; area?: string; lat: number; lng: number; cityId?: string }) {
    await this.billing.assertWithinLimit(tenantId, 'stations');
    return this.prisma.station.create({ data: { ...data, tenantId } });
  }

  async update(tenantId: string, id: string, data: Partial<{ name: string; area: string; lat: number; lng: number; isPublished: boolean }>) {
    const station = await this.prisma.station.findFirst({ where: { id, tenantId } });
    if (!station) throw new NotFoundException('Station not found');
    return this.prisma.station.update({ where: { id: station.id }, data });
  }

  async remove(tenantId: string, id: string) {
    const station = await this.prisma.station.findFirst({ where: { id, tenantId } });
    if (!station) throw new NotFoundException('Station not found');
    return this.prisma.station.delete({ where: { id: station.id } });
  }

  async nearest(tenantId: string, lat: number, lng: number) {
    const stations = await this.listPublished(tenantId);
    if (stations.length === 0) return null;
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    let best: { station: (typeof stations)[number]; distance: number } | null = null;
    for (const s of stations) {
      const dLat = toRad(s.lat - lat);
      const dLng = toRad(s.lng - lng);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat)) * Math.cos(toRad(s.lat)) * Math.sin(dLng / 2) ** 2;
      const distance = 2 * R * Math.asin(Math.sqrt(a));
      if (!best || distance < best.distance) best = { station: s, distance };
    }
    return best;
  }
}
