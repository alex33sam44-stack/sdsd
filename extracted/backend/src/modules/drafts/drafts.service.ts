import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DraftStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { camelizeFlatKeys, normalizeLineData } from '../../common/utils/line-normalize';

@Injectable()
export class DraftsService {
  constructor(private readonly prisma: PrismaService, private readonly billing: BillingService) {}

  async list(tenantId: string, status?: DraftStatus) {
    await this.billing.assertFeatureEnabled(tenantId, 'drafts');
    return this.prisma.draftChange.findMany({
      where: { tenantId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(tenantId: string, authorId: string, data: { entity: string; entityId?: string; patch: any; note?: string }) {
    await this.billing.assertFeatureEnabled(tenantId, 'drafts');
    return this.prisma.draftChange.create({
      data: { tenantId, authorId, ...data },
    });
  }

  async setStatus(tenantId: string, id: string, status: DraftStatus) {
    await this.billing.assertFeatureEnabled(tenantId, 'drafts');
    const draft = await this.prisma.draftChange.findFirst({ where: { id, tenantId } });
    if (!draft) throw new NotFoundException('Draft not found');
    return this.prisma.draftChange.update({ where: { id: draft.id }, data: { status } });
  }

  async apply(tenantId: string, id: string) {
    await this.billing.assertFeatureEnabled(tenantId, 'drafts');
    const draft = await this.prisma.draftChange.findFirst({ where: { id, tenantId } });
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.status !== DraftStatus.approved) {
      throw new BadRequestException('Only approved drafts can be applied');
    }
    const patch = (draft.patch as any) ?? {};
    const op = patch.__op ?? 'update';
    const stripped = { ...patch };
    delete stripped.__op;
    delete stripped.line_id;

    await this.prisma.$transaction(async (tx) => {
      switch (draft.entity) {
        case 'line': {
          const lineData = { ...normalizeLineData(stripped), tenantId };
          if (op === 'update' && draft.entityId) await tx.line.updateMany({ where: { id: draft.entityId, tenantId }, data: lineData });
          else if (op === 'create') await tx.line.create({ data: lineData });
          else if (op === 'delete' && draft.entityId) await tx.line.deleteMany({ where: { id: draft.entityId, tenantId } });
          break;
        }
        case 'station': {
          const stationData = { ...camelizeFlatKeys(stripped), tenantId };
          if (op === 'update' && draft.entityId) await tx.station.updateMany({ where: { id: draft.entityId, tenantId }, data: stationData });
          else if (op === 'create') await tx.station.create({ data: stationData });
          else if (op === 'delete' && draft.entityId) await tx.station.deleteMany({ where: { id: draft.entityId, tenantId } });
          break;
        }
        case 'route_stop': {
          const stopData = { ...camelizeFlatKeys(stripped), tenantId };
          if (op === 'update' && draft.entityId) await tx.routeStop.updateMany({ where: { id: draft.entityId, tenantId }, data: stopData });
          else if (op === 'create' && patch.line_id) await tx.routeStop.create({ data: { ...stopData, lineId: patch.line_id } });
          else if (op === 'delete' && draft.entityId) await tx.routeStop.deleteMany({ where: { id: draft.entityId, tenantId } });
          break;
        }
        case 'layout_zone': {
          const zoneData = { ...camelizeFlatKeys(stripped), tenantId };
          if (op === 'update' && draft.entityId) await tx.layoutZone.updateMany({ where: { id: draft.entityId, tenantId }, data: zoneData });
          else if (op === 'create') await tx.layoutZone.create({ data: zoneData });
          else if (op === 'delete' && draft.entityId) await tx.layoutZone.deleteMany({ where: { id: draft.entityId, tenantId } });
          break;
        }
        case 'station_layout': {
          const layoutData = { ...camelizeFlatKeys(stripped), tenantId };
          if (op === 'update' && draft.entityId) await tx.stationLayout.updateMany({ where: { id: draft.entityId, tenantId }, data: layoutData });
          break;
        }
        default:
          throw new BadRequestException(`Unsupported entity: ${draft.entity}`);
      }
      await tx.draftChange.update({
        where: { id: draft.id },
        data: { status: DraftStatus.applied, appliedAt: new Date() },
      });
    });

    return this.prisma.draftChange.findFirst({ where: { id, tenantId } });
  }
}
