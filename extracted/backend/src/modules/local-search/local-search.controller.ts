import { Controller, Get, Header, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { LocalSearchService } from './local-search.service';
import type { LocalSearchKind, LocalSearchResponse } from './local-search.types';

const ALLOWED_KINDS: readonly LocalSearchKind[] = ['station', 'line', 'stop', 'landmark', 'city'] as const;

/**
 * Public local search endpoint.
 *   GET /api/local-search?q=ramses
 *   GET /api/local-search?q=ميدان+التحرير&kind=landmark
 *   GET /api/local-search?q=helwan&near=29.85,31.33
 *
 * Tenant scope is taken from the request context (set by
 * TenantContextGuard upstream); the catalog half of the response
 * is tenant-agnostic so the endpoint always returns useful hits
 * even before any tenant data is seeded.
 */
@Controller('local-search')
export class LocalSearchController {
  constructor(private readonly service: LocalSearchService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=15, stale-while-revalidate=300')
  async search(
    @Req() req: Request,
    @Query('q') q?: string,
    @Query('kind') kind?: string,
    @Query('limit') limit?: string,
    @Query('near') near?: string,
  ): Promise<LocalSearchResponse> {
    const tenantId = ((req as any).tenantId as string | undefined) ?? null;
    const parsedLimit = limit ? Math.max(1, Math.min(50, Number(limit) || 0)) : undefined;
    const restrictKind =
      kind && ALLOWED_KINDS.includes(kind as LocalSearchKind) ? (kind as LocalSearchKind) : undefined;
    let nearPoint: { lat: number; lng: number } | undefined;
    if (near && /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(near)) {
      const [lat, lng] = near.split(',').map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lng)) nearPoint = { lat, lng };
    }
    return this.service.search(tenantId, {
      q: q ?? '',
      limit: parsedLimit,
      kind: restrictKind,
      near: nearPoint,
    });
  }
}
