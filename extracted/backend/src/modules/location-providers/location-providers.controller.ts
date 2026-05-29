import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { LocationProvidersService } from './location-providers.service';
import { LocationRateLimitGuard } from './rate-limit.guard';
import type {
  LocationSearchInput,
  ReverseGeocodeInput,
  RouteEstimateInput,
} from './types';

/**
 * Public location surface.
 *
 *   GET  /api/location/search?q=&near=lat,lng&limit=
 *   GET  /api/location/reverse?lat=&lng=
 *   POST /api/location/route        { from, to, profile?, via? }
 *   GET  /api/location/status       — current provider chain + selection rules
 *   GET  /api/location/health       — provider-by-provider health snapshot
 *
 * Tightly throttled per IP via LocationRateLimitGuard. Every input
 * is normalized + redacted by the service before anything leaves
 * the host (privacy.ts).
 */
@UseGuards(LocationRateLimitGuard)
@Controller('location')
export class LocationProvidersController {
  constructor(private readonly service: LocationProvidersService) {}

  @Get('search')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  async search(
    @Req() req: Request,
    @Query('q') q?: string,
    @Query('near') near?: string,
    @Query('limit') limit?: string,
    @Query('country') country?: string,
  ) {
    const input: LocationSearchInput = {
      q: q ?? '',
      country: country ?? 'eg',
      locale: ((req as any).locale as string | undefined) ?? 'ar',
      limit: limit ? Math.max(1, Math.min(50, Number(limit) || 5)) : 5,
      near: parseNear(near),
    };
    return this.service.search(input);
  }

  @Get('reverse')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600')
  async reverse(
    @Req() req: Request,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('zoom') zoom?: string,
  ) {
    const input: ReverseGeocodeInput = {
      lat: numberOrThrow(lat, 'lat'),
      lng: numberOrThrow(lng, 'lng'),
      zoom: zoom ? Math.max(3, Math.min(18, Number(zoom) || 16)) : undefined,
      locale: ((req as any).locale as string | undefined) ?? 'ar',
    };
    return this.service.reverse(input);
  }

  /**
   * Route estimate via POST. Preferred for non-trivial payloads
   * (multiple via-points, JSON bodies). Tokens / coordinates are
   * never in the URL, so reverse-proxy access logs stay clean.
   */
  @Post('route')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async routePost(@Body() body: Partial<RouteEstimateInput>) {
    if (!body || !body.from || !body.to) {
      throw new BadRequestException('from and to are required');
    }
    return this.service.route(body as RouteEstimateInput);
  }

  /**
   * Convenience GET form of /route for simple two-point estimates.
   * Coordinates are passed as `from=lat,lng&to=lat,lng`. We do NOT
   * accept any provider tokens via query string — secrets stay
   * server-side only.
   */
  @Get('route')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=600')
  async routeGet(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('profile') profile?: string,
  ) {
    const fromPoint = parseLatLng(from, 'from');
    const toPoint = parseLatLng(to, 'to');
    const allowedProfile =
      profile && ['driving', 'walking', 'cycling'].includes(profile)
        ? (profile as 'driving' | 'walking' | 'cycling')
        : undefined;
    return this.service.route({ from: fromPoint, to: toPoint, profile: allowedProfile });
  }

  /**
   * Capability + selection report. Useful for ops dashboards and
   * for the admin panel's "which provider is in use" tooltip.
   *
   * Two routes for the same payload:
   *   - GET /location/status            (legacy short form)
   *   - GET /location/providers/status  (canonical, namespaced)
   */
  @Get('status')
  @Header('Cache-Control', 'public, max-age=15')
  async status() {
    return this.service.status();
  }

  @Get('providers/status')
  @Header('Cache-Control', 'public, max-age=15')
  async providersStatus() {
    return this.service.status();
  }

  /**
   * Live health snapshot from the heartbeat daemon.
   */
  @Get('health')
  @Header('Cache-Control', 'no-store')
  async health() {
    return this.service.health();
  }

  @Get('providers/health')
  @Header('Cache-Control', 'no-store')
  async providersHealth() {
    return this.service.health();
  }
}

function parseLatLng(value: string | undefined, field: string): { lat: number; lng: number } {
  if (!value || !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(value)) {
    throw new BadRequestException(`${field} must be 'lat,lng'`);
  }
  const [lat, lng] = value.split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new BadRequestException(`${field} must be finite numbers`);
  }
  return { lat, lng };
}

function parseNear(value: string | undefined): { lat: number; lng: number } | undefined {
  if (!value) return undefined;
  if (!/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(value)) return undefined;
  const [lat, lng] = value.split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat, lng };
}

function numberOrThrow(value: string | undefined, field: string): number {
  if (!value) throw new BadRequestException(`${field} is required`);
  const n = Number(value);
  if (!Number.isFinite(n)) throw new BadRequestException(`${field} must be a number`);
  return n;
}
