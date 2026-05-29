import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ZonesService {
  constructor(private readonly prisma: PrismaService) {}

  listByStation(tenantId: string, stationId: string) {
    return this.prisma.layoutZone.findMany({ where: { tenantId, stationId } });
  }

  create(tenantId: string, data: { stationId: string; zoneKey: string; label?: string; x: number; y: number; w: number; h: number }) {
    return this.prisma.layoutZone.create({ data: { ...data, tenantId } });
  }

  async update(tenantId: string, id: string, data: any) {
    const zone = await this.prisma.layoutZone.findFirst({ where: { id, tenantId } });
    if (!zone) throw new NotFoundException('Zone not found');
    return this.prisma.layoutZone.update({ where: { id: zone.id }, data });
  }

  async remove(tenantId: string, id: string) {
    const zone = await this.prisma.layoutZone.findFirst({ where: { id, tenantId } });
    if (!zone) throw new NotFoundException('Zone not found');
    return this.prisma.layoutZone.delete({ where: { id: zone.id } });
  }
}
