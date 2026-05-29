import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, entity?: string, limit = 100) {
    return this.prisma.auditLog.findMany({
      where: { tenantId, ...(entity ? { entity } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  log(tenantId: string, actorId: string | null, entity: string, action: string, entityId?: string, diff?: unknown) {
    return this.prisma.auditLog.create({
      data: { tenantId, actorId: actorId ?? undefined, entity, entityId, action, diff: diff as any },
    });
  }
}
