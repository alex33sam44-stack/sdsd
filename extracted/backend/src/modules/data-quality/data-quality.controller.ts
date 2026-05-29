import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DataQualityService } from './data-quality.service';

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
}
