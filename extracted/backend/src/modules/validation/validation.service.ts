import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BillingService } from '../billing/billing.service';

export interface ValidationIssue {
  level: 'error' | 'warning';
  entity: 'station' | 'line' | 'route_stop';
  entityId: string;
  message: string;
}

@Injectable()
export class ValidationService {
  constructor(private readonly prisma: PrismaService, private readonly billing: BillingService) {}

  async runAll(tenantId: string): Promise<ValidationIssue[]> {
    await this.billing.assertFeatureEnabled(tenantId, 'validation');
    const issues: ValidationIssue[] = [];

    const stations = await this.prisma.station.findMany({
      where: { tenantId },
      include: { lines: { where: { tenantId }, include: { stops: { where: { tenantId } } } } },
    });

    for (const s of stations) {
      if (!s.name?.trim()) issues.push({ level: 'error', entity: 'station', entityId: s.id, message: 'Station has no name' });
      if (s.lat === 0 && s.lng === 0) issues.push({ level: 'warning', entity: 'station', entityId: s.id, message: 'Station coordinates are 0,0' });
      if (s.isPublished && s.lines.filter((l) => l.isPublished).length === 0) {
        issues.push({ level: 'warning', entity: 'station', entityId: s.id, message: 'Published station has no published lines' });
      }
      for (const l of s.lines) {
        if (!l.destination?.trim()) issues.push({ level: 'error', entity: 'line', entityId: l.id, message: 'Line has no destination' });
        if (l.isPublished && l.stops.length === 0) {
          issues.push({ level: 'warning', entity: 'line', entityId: l.id, message: 'Published line has no stops' });
        }
        if (l.zoneX == null || l.zoneY == null || l.zoneW == null || l.zoneH == null) {
          issues.push({ level: 'warning', entity: 'line', entityId: l.id, message: 'Line has no layout zone' });
        }
        const positions = l.stops.map((s) => s.position).sort((a, b) => a - b);
        for (let i = 0; i < positions.length; i++) {
          if (positions[i] !== i + 1) {
            issues.push({ level: 'warning', entity: 'line', entityId: l.id, message: 'Stop positions are not sequential' });
            break;
          }
        }
        for (const stop of l.stops) {
          if (!stop.name?.trim()) issues.push({ level: 'error', entity: 'route_stop', entityId: stop.id, message: 'Stop has no name' });
        }
      }
    }
    return issues;
  }
}
