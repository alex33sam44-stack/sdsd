import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Per-IP rate limiter for the location surface.
 *
 * Scopes:
 *   - search/reverse : 30 req/min/IP
 *   - route          : 10 req/min/IP (more expensive upstream)
 *
 * The global ThrottlerGuard already caps every IP at 120/min across
 * the API; this guard tightens the location endpoints further so a
 * single buggy client cannot exhaust the upstream Nominatim or OSRM
 * quota for everyone.
 */
@Injectable()
export class LocationRateLimitGuard extends ThrottlerGuard {
  protected getTracker(req: Request): Promise<string> {
    const xff = (req.headers['x-forwarded-for'] ?? '') as string;
    const first = xff.split(',')[0]?.trim();
    const ip = first || req.ip || (req.socket as any)?.remoteAddress || 'unknown';
    return Promise.resolve(`location:${ip}`);
  }

  protected async getRequestResponse(context: ExecutionContext) {
    return super.getRequestResponse(context);
  }
}
