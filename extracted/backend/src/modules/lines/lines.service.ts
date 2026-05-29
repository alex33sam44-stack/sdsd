import { Injectable, NotFoundException } from '@nestjs/common';
import { LineStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalizeLineData, normalizeLineStatus } from '../../common/utils/line-normalize';
import { BillingService } from '../billing/billing.service';

@Injectable()
export class LinesService {
  constructor(private readonly prisma: PrismaService, private readonly billing: BillingService) {}

  async getOne(tenantId: string, id: string) {
    const line = await this.prisma.line.findFirst({
      where: { id, tenantId },
      include: { stops: { where: { tenantId }, orderBy: { position: 'asc' } } },
    });
    if (!line) throw new NotFoundException('Line not found');
    return line;
  }

  listByStation(tenantId: string, stationId: string, includeUnpublished = false) {
    return this.prisma.line.findMany({
      where: { tenantId, stationId, ...(includeUnpublished ? {} : { isPublished: true }) },
      include: { stops: { where: { tenantId }, orderBy: { position: 'asc' } } },
      orderBy: { destination: 'asc' },
    });
  }

  async create(tenantId: string, data: any) {
    await this.billing.assertWithinLimit(tenantId, 'lines');
    return this.prisma.line.create({ data: { ...normalizeLineData(data), tenantId } });
  }

  async update(tenantId: string, id: string, data: any) {
    const line = await this.prisma.line.findFirst({ where: { id, tenantId } });
    if (!line) throw new NotFoundException('Line not found');
    return this.prisma.line.update({ where: { id: line.id }, data: normalizeLineData(data) });
  }

  async remove(tenantId: string, id: string) {
    const line = await this.prisma.line.findFirst({ where: { id, tenantId } });
    if (!line) throw new NotFoundException('Line not found');
    return this.prisma.line.delete({ where: { id: line.id } });
  }

  async setAvailability(tenantId: string, id: string, cars: number, status: LineStatus | string, actorId: string) {
    const line = await this.prisma.line.findFirst({ where: { id, tenantId } });
    if (!line) throw new NotFoundException('Line not found');
    const normalizedStatus = normalizeLineStatus(status) ?? LineStatus.active;
    const updated = await this.prisma.line.update({
      where: { id: line.id },
      data: { cars, status: normalizedStatus, carsUpdatedAt: new Date() },
    });
    await this.prisma.availabilityLog.create({
      data: { tenantId, lineId: line.id, cars, status: normalizedStatus, changedBy: actorId },
    });
    return updated;
  }
}
