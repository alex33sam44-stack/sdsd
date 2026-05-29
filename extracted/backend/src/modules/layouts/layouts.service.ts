import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class LayoutsService {
  constructor(private readonly prisma: PrismaService) {}

  getByStation(tenantId: string, stationId: string) {
    return this.prisma.stationLayout.findFirst({ where: { tenantId, stationId } });
  }

  async upsert(tenantId: string, stationId: string, data: { viewbox?: string; notes?: string }) {
    const existing = await this.prisma.stationLayout.findFirst({ where: { tenantId, stationId } });
    if (existing) {
      return this.prisma.stationLayout.update({ where: { id: existing.id }, data });
    }
    return this.prisma.stationLayout.create({
      data: { tenantId, stationId, viewbox: data.viewbox ?? '0 0 100 100', notes: data.notes },
    });
  }
}
