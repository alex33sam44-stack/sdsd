import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type {
  IntercityRouteRecord,
  IntercityScheduleEntry,
  IntercitySearchQuery,
  IntercityVehicle,
} from './intercity.types';

/**
 * Read/search service for intercity routes.
 *
 * Uses prisma raw queries because the intercity tables are added in
 * a migration but not yet in the generated Prisma client at the
 * time of this PR (the schema patch ships separately so we don't
 * regenerate the client in this commit). Once `prisma generate` is
 * run with the patched schema, callers can swap to typed accessors;
 * the behaviour is identical.
 */
@Injectable()
export class IntercityService {
  constructor(private readonly prisma: PrismaService) {}

  async search(tenantId: string | null, query: IntercitySearchQuery): Promise<IntercityRouteRecord[]> {
    const limit = Math.min(50, Math.max(1, query.limit ?? 20));

    const conditions: string[] = ['r.is_published = TRUE'];
    const params: unknown[] = [];

    // Tenant scope: prefer tenant-owned rows but always include null-
    // tenant (platform) rows so a fresh tenant gets sensible results.
    if (tenantId) {
      conditions.push('(r.tenant_id = ? OR r.tenant_id IS NULL)');
      params.push(tenantId);
    } else {
      conditions.push('r.tenant_id IS NULL');
    }

    if (query.from) {
      conditions.push('(c_from.id = ? OR c_from.slug = ?)');
      params.push(query.from, query.from);
    }
    if (query.to) {
      conditions.push('(c_to.id = ? OR c_to.slug = ?)');
      params.push(query.to, query.to);
    }
    if (query.carrier) {
      conditions.push('LOWER(r.carrier) = LOWER(?)');
      params.push(query.carrier);
    }
    if (query.vehicleType) {
      conditions.push('r.vehicle_type = ?');
      params.push(query.vehicleType);
    }

    const where = conditions.join(' AND ');

    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT r.*, c_from.slug AS from_slug, c_to.slug AS to_slug,
              c_from.name AS from_name, c_to.name AS to_name
         FROM intercity_routes r
         JOIN cities c_from ON c_from.id = r.from_city_id
         JOIN cities c_to   ON c_to.id   = r.to_city_id
        WHERE ${where}
        ORDER BY r.tenant_id DESC, r.duration_minutes ASC
        LIMIT ${limit}`,
      ...params,
    )) as any[];

    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(', ');
    const schedules = (await this.prisma.$queryRawUnsafe(
      `SELECT id, route_id, depart_time, arrive_time, days_of_week, seats_total, notes
         FROM intercity_schedules
        WHERE route_id IN (${placeholders})
        ORDER BY depart_time ASC`,
      ...ids,
    )) as any[];

    const grouped = new Map<string, IntercityScheduleEntry[]>();
    for (const s of schedules) {
      const list = grouped.get(s.route_id) ?? [];
      list.push({
        id: s.id,
        departTime: s.depart_time,
        arriveTime: s.arrive_time ?? undefined,
        daysOfWeek: s.days_of_week ?? '1234567',
        seatsTotal: s.seats_total ?? undefined,
        notes: s.notes ?? undefined,
      });
      grouped.set(s.route_id, list);
    }

    let mapped = rows.map((r) => this.toRecord(r, grouped.get(r.id) ?? []));
    if (typeof query.day === 'number' && query.day >= 1 && query.day <= 7) {
      const dayChar = String(query.day);
      mapped = mapped
        .map((rec) => ({
          ...rec,
          schedules: rec.schedules.filter((s) => s.daysOfWeek.includes(dayChar)),
        }))
        .filter((rec) => rec.schedules.length > 0);
    }
    if (query.afterTime && /^\d{2}:\d{2}$/.test(query.afterTime)) {
      mapped = mapped
        .map((rec) => ({
          ...rec,
          schedules: rec.schedules.filter((s) => s.departTime >= query.afterTime!),
        }))
        .filter((rec) => rec.schedules.length > 0);
    }

    return mapped;
  }

  async getById(tenantId: string | null, id: string): Promise<IntercityRouteRecord> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT r.*, c_from.slug AS from_slug, c_to.slug AS to_slug
         FROM intercity_routes r
         JOIN cities c_from ON c_from.id = r.from_city_id
         JOIN cities c_to   ON c_to.id   = r.to_city_id
        WHERE r.id = ? AND (r.tenant_id IS NULL OR r.tenant_id = ?)
        LIMIT 1`,
      id,
      tenantId,
    )) as any[];
    if (rows.length === 0) throw new NotFoundException('Intercity route not found');
    const schedules = (await this.prisma.$queryRawUnsafe(
      `SELECT id, route_id, depart_time, arrive_time, days_of_week, seats_total, notes
         FROM intercity_schedules
        WHERE route_id = ?
        ORDER BY depart_time ASC`,
      id,
    )) as any[];
    return this.toRecord(
      rows[0],
      schedules.map((s) => ({
        id: s.id,
        departTime: s.depart_time,
        arriveTime: s.arrive_time ?? undefined,
        daysOfWeek: s.days_of_week ?? '1234567',
        seatsTotal: s.seats_total ?? undefined,
        notes: s.notes ?? undefined,
      })),
    );
  }

  // ---------------- internals ----------------

  private toRecord(row: any, schedules: IntercityScheduleEntry[]): IntercityRouteRecord {
    let amenities: string[] = [];
    try {
      amenities = typeof row.amenities === 'string' ? JSON.parse(row.amenities) : row.amenities ?? [];
    } catch {
      amenities = [];
    }
    return {
      id: row.id,
      tenantId: row.tenant_id ?? null,
      fromCityId: row.from_city_id,
      toCityId: row.to_city_id,
      carrier: row.carrier,
      vehicleType: (row.vehicle_type ?? 'bus') as IntercityVehicle,
      distanceKm: row.distance_km ?? undefined,
      durationMinutes: row.duration_minutes ?? undefined,
      fareMin: row.fare_min != null ? Number(row.fare_min) : undefined,
      fareMax: row.fare_max != null ? Number(row.fare_max) : undefined,
      currency: row.currency ?? 'EGP',
      frequencyLabel: row.frequency_label ?? undefined,
      amenities,
      isPublished: !!row.is_published,
      schedules,
    };
  }
}
