import { Controller, Get, Header, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { IntercityService } from './intercity.service';
import type { IntercityVehicle } from './intercity.types';

/**
 * Public intercity browse endpoints.
 *
 *   GET /api/intercity/routes?from=cairo&to=alexandria
 *   GET /api/intercity/routes?carrier=GoBus&day=2
 *   GET /api/intercity/routes/:id
 *
 * Names (carrier, frequency, notes) flow through the global
 * I18nResponseInterceptor so the response is localized to the
 * caller's locale automatically.
 */
@Controller('intercity')
export class IntercityController {
  constructor(private readonly service: IntercityService) {}

  @Get('routes')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  async list(
    @Req() req: Request,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('carrier') carrier?: string,
    @Query('vehicle') vehicle?: string,
    @Query('day') day?: string,
    @Query('afterTime') afterTime?: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId = ((req as any).tenantId as string | undefined) ?? null;
    return this.service.search(tenantId, {
      from,
      to,
      carrier,
      vehicleType: this.parseVehicle(vehicle),
      day: day ? Math.max(1, Math.min(7, Number(day) || 0)) : undefined,
      afterTime,
      limit: limit ? Math.max(1, Math.min(50, Number(limit) || 0)) : undefined,
    });
  }

  @Get('routes/:id')
  async getOne(@Req() req: Request, @Param('id') id: string) {
    const tenantId = ((req as any).tenantId as string | undefined) ?? null;
    return this.service.getById(tenantId, id);
  }

  private parseVehicle(value: string | undefined): IntercityVehicle | undefined {
    if (!value) return undefined;
    if (['bus', 'minibus', 'microbus', 'train', 'shared_taxi'].includes(value)) {
      return value as IntercityVehicle;
    }
    return undefined;
  }
}
