import { Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DataQualityService } from './data-quality.service';
import { _ALL_EXTRA_CHECK_IDS } from './data-quality.extra-checks';

/**
 * Operator-facing data quality endpoints.
 *
 *   GET /api/data-quality           — auth required (admin/operator)
 *   GET /api/data-quality/public    — anonymous, returns the band only
 *
 * The full report carries sample IDs that should not leak to the
 * public, hence the auth guard. The public endpoint is safe to embed
 * in a marketing widget.
 */
@Controller('data-quality')
export class DataQualityController {
  constructor(private readonly service: DataQualityService) {}

  @Get('public')
  @Header('Cache-Control', 'public, max-age=120, stale-while-revalidate=600')
  async publicSummary(@Req() req: Request) {
    const tenantId = ((req as any).tenantId as string | undefined) ?? null;
    const report = await this.service.report(tenantId);
    // Strip sample IDs and counts that could expose row volumes.
    return {
      generatedAt: report.generatedAt,
      band: report.band,
      score: Math.round(report.score),
      readiness:
        report.band === 'green'
          ? 'ready'
          : report.band === 'amber'
            ? 'partial'
            : 'limited',
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('platform_admin', 'platform_owner', 'support_agent')
  async fullReport(@Req() req: Request) {
    const tenantId = ((req as any).tenantId as string | undefined) ?? null;
    return this.service.report(tenantId);
  }

  /**
   * Admin-only listing of all available checks (legacy + extra) so
   * the admin UI can render their labels + severities without
   * having to also fetch a full report. Strictly RBAC-gated.
   */
  @Get('admin/checks')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('platform_admin', 'platform_owner')
  async listChecks() {
    return {
      generatedAt: new Date().toISOString(),
      legacyCheckIds: [
        'stations.published.min',
        'stations.with-no-lines',
        'lines.thin-routes',
        'lines.orphan-published',
        'stops.invalid-coords',
        'lines.stop-order',
        'stations.unpublished-share',
        'intercity.routes.exist',
        'intercity.schedules.exist',
      ],
      extraCheckIds: [..._ALL_EXTRA_CHECK_IDS],
    };
  }

  /**
   * Admin filtered report — same payload as the full report but
   * restricted to a subset of check IDs (?ids=lines.stale,lines.missing-fare).
   * Useful when an operator wants to focus a triage session.
   */
  @Get('admin/report')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('platform_admin', 'platform_owner', 'support_agent')
  async filteredReport(@Req() req: Request, @Query('ids') ids?: string) {
    const tenantId = ((req as any).tenantId as string | undefined) ?? null;
    const report = await this.service.report(tenantId);
    if (!ids) return report;
    const wanted = new Set(
      ids
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
    return {
      ...report,
      checks: report.checks.filter((c) => wanted.has(c.id)),
    };
  }
}
