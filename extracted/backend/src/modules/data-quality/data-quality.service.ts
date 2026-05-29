import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type {
  QualityCheck,
  QualityCounts,
  QualityReport,
  Severity,
} from './data-quality.types';

const WEIGHTS: Record<Severity, number> = {
  info: 1,
  warning: 3,
  critical: 8,
};

const MIN_COVERAGE = {
  /** Minimum number of published stations before we consider the catalog launched. */
  stations: 3,
  /** Minimum number of published lines per published station. */
  linesPerStation: 1,
  /** Minimum number of route stops per published line. */
  stopsPerLine: 2,
  /** Maximum acceptable share of unpublished entities. */
  unpublishedShareWarn: 0.5,
};

/**
 * Computes a deterministic data quality report for a tenant.
 *
 * The report is the source of truth for both the admin dashboard
 * and the `verify:data-quality` CI script. Keeping the maths in one
 * place ensures the gate, the dashboard and the public widget never
 * disagree.
 */
@Injectable()
export class DataQualityService {
  constructor(private readonly prisma: PrismaService) {}

  async report(tenantId: string | null): Promise<QualityReport> {
    const counts = await this.collectCounts(tenantId);
    const checks: QualityCheck[] = [
      ...(await this.checkPublishedStations(tenantId, counts)),
      ...(await this.checkLineCoverage(tenantId, counts)),
      ...(await this.checkStopCoverage(tenantId, counts)),
      ...(await this.checkOrphanLines(tenantId)),
      ...(await this.checkOrphanStops(tenantId)),
      ...(await this.checkLineGeometry(tenantId)),
      ...(await this.checkUnpublishedShare(counts)),
      ...(await this.checkIntercityCoverage(tenantId, counts)),
    ];

    const score = this.score(checks);
    const band: 'green' | 'amber' | 'red' = score >= 85 ? 'green' : score >= 60 ? 'amber' : 'red';

    return {
      generatedAt: new Date().toISOString(),
      tenantId,
      counts,
      checks,
      score,
      band,
    };
  }

  // ------------------------- counts -------------------------

  private async collectCounts(tenantId: string | null): Promise<QualityCounts> {
    const where = tenantId ? { tenantId } : {};
    const [cities, stations, publishedStations, lines, publishedLines, stops] = await Promise.all([
      this.prisma.city.count({ where }),
      this.prisma.station.count({ where }),
      this.prisma.station.count({ where: { ...where, isPublished: true } }),
      this.prisma.line.count({ where }),
      this.prisma.line.count({ where: { ...where, isPublished: true } }),
      this.prisma.routeStop.count({ where }),
    ]);
    const intercityRoutes = await this.safeRawCount(
      `SELECT COUNT(*) AS c FROM intercity_routes WHERE (tenant_id IS NULL OR tenant_id = ?)`,
      tenantId,
    );
    const intercitySchedules = await this.safeRawCount(
      `SELECT COUNT(*) AS c FROM intercity_schedules s
         JOIN intercity_routes r ON r.id = s.route_id
         WHERE (r.tenant_id IS NULL OR r.tenant_id = ?)`,
      tenantId,
    );
    return {
      cities,
      stations,
      publishedStations,
      lines,
      publishedLines,
      stops,
      intercityRoutes,
      intercitySchedules,
    };
  }

  private async safeRawCount(sql: string, ...params: unknown[]): Promise<number> {
    try {
      const rows = (await this.prisma.$queryRawUnsafe(sql, ...params)) as Array<{ c: bigint | number }>;
      const n = rows[0]?.c;
      return typeof n === 'bigint' ? Number(n) : Number(n ?? 0);
    } catch {
      // Tables may not yet exist on a fresh install — surface 0 so
      // the report still renders, with a single "missing" check
      // produced by checkIntercityCoverage.
      return 0;
    }
  }

  // ------------------------- checks -------------------------

  private async checkPublishedStations(_t: string | null, counts: QualityCounts): Promise<QualityCheck[]> {
    const ok = counts.publishedStations >= MIN_COVERAGE.stations;
    return [
      {
        id: 'stations.published.min',
        label: `Published stations ≥ ${MIN_COVERAGE.stations}`,
        severity: 'critical',
        status: ok ? 'pass' : 'fail',
        count: ok ? 0 : MIN_COVERAGE.stations - counts.publishedStations,
      },
    ];
  }

  private async checkLineCoverage(tenantId: string | null, counts: QualityCounts): Promise<QualityCheck[]> {
    if (counts.publishedStations === 0) return [];
    const where = tenantId ? { tenantId } : {};
    const stations = await this.prisma.station.findMany({
      where: { ...where, isPublished: true },
      select: { id: true, _count: { select: { lines: { where: { ...where, isPublished: true } } } } },
    });
    const offenders = stations
      .filter((s) => s._count.lines < MIN_COVERAGE.linesPerStation)
      .map((s) => s.id);
    return [
      {
        id: 'stations.with-no-lines',
        label: `Stations without published lines ≤ 0`,
        severity: 'critical',
        status: offenders.length === 0 ? 'pass' : 'fail',
        count: offenders.length,
        sample: offenders.slice(0, 5),
      },
    ];
  }

  private async checkStopCoverage(tenantId: string | null, counts: QualityCounts): Promise<QualityCheck[]> {
    if (counts.publishedLines === 0) return [];
    const where = tenantId ? { tenantId } : {};
    const lines = await this.prisma.line.findMany({
      where: { ...where, isPublished: true },
      select: { id: true, _count: { select: { stops: true } } },
    });
    const offenders = lines.filter((l) => l._count.stops < MIN_COVERAGE.stopsPerLine).map((l) => l.id);
    return [
      {
        id: 'lines.thin-routes',
        label: `Published lines with at least ${MIN_COVERAGE.stopsPerLine} stops`,
        severity: 'warning',
        status: offenders.length === 0 ? 'pass' : 'fail',
        count: offenders.length,
        sample: offenders.slice(0, 5),
      },
    ];
  }

  private async checkOrphanLines(tenantId: string | null): Promise<QualityCheck[]> {
    const where = tenantId ? { tenantId } : {};
    // Orphan = the station was deleted/unpublished but the line is
    // still flagged published.
    const lines = await this.prisma.line.findMany({
      where: { ...where, isPublished: true },
      select: { id: true, station: { select: { isPublished: true } } },
    });
    const offenders = lines.filter((l) => !l.station?.isPublished).map((l) => l.id);
    return [
      {
        id: 'lines.orphan-published',
        label: `Published lines whose station is unpublished`,
        severity: 'critical',
        status: offenders.length === 0 ? 'pass' : 'fail',
        count: offenders.length,
        sample: offenders.slice(0, 5),
      },
    ];
  }

  private async checkOrphanStops(tenantId: string | null): Promise<QualityCheck[]> {
    const where = tenantId ? { tenantId } : {};
    const stops = await this.prisma.routeStop.findMany({
      where,
      select: { id: true, lat: true, lng: true },
    });
    const offenders = stops
      .filter((s) => !this.isFiniteCoord(s.lat) || !this.isFiniteCoord(s.lng))
      .map((s) => s.id);
    return [
      {
        id: 'stops.invalid-coords',
        label: `Stops with valid lat/lng`,
        severity: 'critical',
        status: offenders.length === 0 ? 'pass' : 'fail',
        count: offenders.length,
        sample: offenders.slice(0, 5),
      },
    ];
  }

  private async checkLineGeometry(tenantId: string | null): Promise<QualityCheck[]> {
    const where = tenantId ? { tenantId } : {};
    const lines = await this.prisma.line.findMany({
      where: { ...where, isPublished: true },
      select: { id: true, stops: { select: { position: true }, orderBy: { position: 'asc' } } },
    });
    const offenders: string[] = [];
    for (const l of lines) {
      const positions = l.stops.map((s) => s.position);
      let monotonic = true;
      for (let i = 1; i < positions.length; i += 1) {
        if (positions[i] <= positions[i - 1]) {
          monotonic = false;
          break;
        }
      }
      if (!monotonic) offenders.push(l.id);
    }
    return [
      {
        id: 'lines.stop-order',
        label: `Published lines with strictly increasing stop positions`,
        severity: 'warning',
        status: offenders.length === 0 ? 'pass' : 'fail',
        count: offenders.length,
        sample: offenders.slice(0, 5),
      },
    ];
  }

  private async checkUnpublishedShare(counts: QualityCounts): Promise<QualityCheck[]> {
    if (counts.stations === 0) return [];
    const share = (counts.stations - counts.publishedStations) / counts.stations;
    const ok = share <= MIN_COVERAGE.unpublishedShareWarn;
    return [
      {
        id: 'stations.unpublished-share',
        label: `Unpublished station share ≤ ${Math.round(MIN_COVERAGE.unpublishedShareWarn * 100)}%`,
        severity: 'warning',
        status: ok ? 'pass' : 'fail',
        count: counts.stations - counts.publishedStations,
      },
    ];
  }

  private async checkIntercityCoverage(_t: string | null, counts: QualityCounts): Promise<QualityCheck[]> {
    return [
      {
        id: 'intercity.routes.exist',
        label: `At least one intercity route is seeded`,
        severity: 'info',
        status: counts.intercityRoutes >= 1 ? 'pass' : 'fail',
        count: counts.intercityRoutes,
      },
      {
        id: 'intercity.schedules.exist',
        label: `Intercity routes have schedules attached`,
        severity: 'info',
        status: counts.intercitySchedules >= counts.intercityRoutes && counts.intercityRoutes > 0 ? 'pass' : 'fail',
        count: counts.intercitySchedules,
      },
    ];
  }

  // ------------------------- helpers -------------------------

  private isFiniteCoord(n: number | null | undefined): boolean {
    return typeof n === 'number' && Number.isFinite(n) && Math.abs(n) > 0.0001;
  }

  private score(checks: QualityCheck[]): number {
    if (checks.length === 0) return 100;
    const totalWeight = checks.reduce((sum, c) => sum + WEIGHTS[c.severity], 0);
    const passWeight = checks
      .filter((c) => c.status === 'pass')
      .reduce((sum, c) => sum + WEIGHTS[c.severity], 0);
    if (totalWeight === 0) return 100;
    return Math.round((passWeight / totalWeight) * 100);
  }
}
