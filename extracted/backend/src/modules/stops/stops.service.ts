import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BillingService } from '../billing/billing.service';

@Injectable()
export class StopsService {
  constructor(private readonly prisma: PrismaService, private readonly billing: BillingService) {}

  listByLine(tenantId: string, lineId: string) {
    return this.prisma.routeStop.findMany({
      where: { tenantId, lineId },
      orderBy: { position: 'asc' },
    });
  }

  async create(tenantId: string, data: { lineId: string; position: number; name: string; lat: number; lng: number; keywords?: string[] }) {
    await this.billing.assertWithinLimit(tenantId, 'routeStops');
    return this.prisma.routeStop.create({ data: { ...data, tenantId, keywords: data.keywords ?? [] } });
  }

  async update(tenantId: string, id: string, data: any) {
    const stop = await this.prisma.routeStop.findFirst({ where: { id, tenantId } });
    if (!stop) throw new NotFoundException('Stop not found');
    return this.prisma.routeStop.update({ where: { id: stop.id }, data });
  }

  async remove(tenantId: string, id: string) {
    const stop = await this.prisma.routeStop.findFirst({ where: { id, tenantId } });
    if (!stop) throw new NotFoundException('Stop not found');
    return this.prisma.routeStop.delete({ where: { id: stop.id } });
  }

  async reorder(tenantId: string, lineId: string, orderedIds: string[]) {
    await this.prisma.$transaction(
      orderedIds.map((id, idx) =>
        this.prisma.routeStop.updateMany({ where: { id, tenantId, lineId }, data: { position: idx + 1 } }),
      ),
    );
    return this.listByLine(tenantId, lineId);
  }
}
