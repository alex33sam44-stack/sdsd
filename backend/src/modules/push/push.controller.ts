import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { PushService } from './push.service';
import type { SubscribeDto } from './push.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalTenantContextGuard } from '../../common/tenancy/tenant-context.guard';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@Controller('push')
export class PushController {
  constructor(private readonly service: PushService) {}

  /**
   * Public, throttled. Returns the VAPID public key the browser needs to
   * call `pushManager.subscribe(...)`. When the server is not configured,
   * `publicKey` is `null` so the frontend can hide the toggle.
   */
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('public-key')
  publicKey() {
    const status = this.service.getStatus();
    return {
      publicKey: status.publicKey,
      configured: status.configured,
      ...(status.configured ? {} : { reasons: ['push_unconfigured'] }),
    };
  }

  @UseGuards(JwtAuthGuard, OptionalTenantContextGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('subscriptions')
  subscribe(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: { id: string } | null,
    @Body() body: SubscribeDto,
    @Req() req: Request,
  ) {
    const userAgent = req.headers['user-agent'];
    const ua = Array.isArray(userAgent) ? userAgent[0] : userAgent ?? null;
    return this.service.subscribe(user.id, tenant?.id ?? null, body, ua);
  }

  /**
   * Server-side cleanup when the user disables push from the UI. The
   * endpoint is passed as a query string because some HTTP clients drop
   * DELETE bodies; the frontend hashes server-side via the service.
   */
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('subscriptions/unsubscribe')
  unsubscribe(@CurrentUser() user: AuthUser, @Body() body: { endpoint: string }) {
    return this.service.unsubscribe(user.id, body?.endpoint ?? '');
  }

  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('test')
  test(@CurrentUser() user: AuthUser) {
    return this.service.sendTest(user.id);
  }

  /** Used by debug tooling — `?endpoint=...` removes one device's row. */
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('subscriptions/status')
  status(@CurrentUser() user: AuthUser, @Query('endpoint') endpoint?: string) {
    void user;
    void endpoint;
    return this.service.getStatus();
  }
}
