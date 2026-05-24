import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  UserContribution,
  UserContributionStatus,
  UserContributionType,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateContributionDto,
  ListContributionsQuery,
  UpdateContributionStatusDto,
} from './contributions.dto';

const VALID_TYPES = new Set<string>(['station_line', 'route_feature']);
const VALID_STATUSES = new Set<string>([
  'pending_review',
  'approved',
  'rejected',
  'applied',
]);

const STATION_LINE_KEYS = [
  'destination',
  'pickupArea',
  'vehicleType',
  'notes',
  'contact',
  'lineDestination',
] as const;

const ROUTE_FEATURE_KEYS = [
  'kind',
  'title',
  'stopName',
  'lineDestination',
  'notes',
  'contact',
] as const;

@Injectable()
export class ContributionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public submission — accepts authenticated and anonymous traffic. The tenant
   * is resolved from `req.tenantContext` upstream and may be null (in which
   * case the row is recorded without a tenant FK and shows up in the
   * platform-wide moderation queue).
   */
  async submit(
    dto: CreateContributionDto,
    tenantId: string | null,
    submittedById: string | null,
  ): Promise<UserContribution> {
    const type = this.normalizeType(dto.type);

    const stationName =
      typeof dto.stationName === 'string' && dto.stationName.trim()
        ? dto.stationName.trim().slice(0, 191)
        : null;
    const stationId = this.normalizeId(dto.stationId);
    const lineId = this.normalizeId(dto.lineId);

    if (type === UserContributionType.station_line) {
      if (!dto.destination || !dto.pickupArea) {
        throw new BadRequestException('destination and pickupArea are required');
      }
    } else if (type === UserContributionType.route_feature) {
      if (!dto.title) {
        throw new BadRequestException('title is required');
      }
      if (!lineId) {
        throw new BadRequestException('lineId is required for route_feature');
      }
    }

    const payload = this.buildPayload(dto, type);

    return this.prisma.userContribution.create({
      data: {
        tenantId,
        submittedById,
        type,
        status: UserContributionStatus.pending_review,
        stationId,
        stationName,
        lineId,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Authenticated listing for moderators. When `tenantId` is null (platform
   * admins acting outside a tenant) we surface every contribution.
   */
  list(tenantId: string | null, query: ListContributionsQuery) {
    const where: Prisma.UserContributionWhereInput = {};
    if (tenantId) where.tenantId = tenantId;
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.stationId) where.stationId = query.stationId;
    if (query.lineId) where.lineId = query.lineId;
    return this.prisma.userContribution.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async setStatus(
    tenantId: string | null,
    id: string,
    dto: UpdateContributionStatusDto,
    reviewerId: string,
  ): Promise<UserContribution> {
    if (!VALID_STATUSES.has(dto.status)) {
      throw new BadRequestException(`Invalid status: ${dto.status}`);
    }
    const where: Prisma.UserContributionWhereInput = { id };
    if (tenantId) where.tenantId = tenantId;
    const existing = await this.prisma.userContribution.findFirst({ where });
    if (!existing) throw new NotFoundException('Contribution not found');

    return this.prisma.userContribution.update({
      where: { id: existing.id },
      data: {
        status: dto.status,
        reviewNote: dto.reviewNote?.toString().slice(0, 2000) ?? null,
        reviewedAt: new Date(),
        reviewerId,
      },
    });
  }

  private normalizeType(raw: unknown): UserContributionType {
    if (typeof raw !== 'string' || !VALID_TYPES.has(raw)) {
      throw new BadRequestException(`Invalid contribution type: ${String(raw)}`);
    }
    return raw as UserContributionType;
  }

  private normalizeId(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed.slice(0, 191) : null;
  }

  private buildPayload(dto: CreateContributionDto, type: UserContributionType) {
    const keys =
      type === UserContributionType.station_line
        ? STATION_LINE_KEYS
        : ROUTE_FEATURE_KEYS;
    const payload: Record<string, unknown> = {};
    for (const key of keys) {
      const value = (dto as unknown as Record<string, unknown>)[key];
      if (value === undefined) continue;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        payload[key] = trimmed.length > 0 ? trimmed.slice(0, 1000) : null;
      } else if (value === null) {
        payload[key] = null;
      } else {
        payload[key] = value;
      }
    }
    if (dto.clientId) payload.clientId = String(dto.clientId).slice(0, 191);
    if (dto.submittedAt) payload.submittedAt = String(dto.submittedAt).slice(0, 64);
    return payload;
  }
}
