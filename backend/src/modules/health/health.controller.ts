import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

/**
 * Health & readiness endpoints.
 *
 * Mounted under the global `/api` prefix in main.ts, so the public URLs are:
 *   GET /api/health  -> { status: 'ok', db: 'up' | 'down', uptime, version, auth: {...} }
 *   GET /api/ready   -> 200 only when DB is reachable (for k8s/Caddy probes)
 *
 * Kept dependency-free (no auth, no throttling) so uptime monitors can hit it.
 */
@Controller()
export class HealthController {
  private readonly bootedAt = Date.now();

  constructor(private readonly prisma: PrismaService, private readonly auth: AuthService) {}

  @Get('health')
  async health() {
    let db: 'up' | 'down' = 'down';
    let dbError: string | undefined;
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      db = 'up';
    } catch (e) {
      dbError = e instanceof Error ? e.message : String(e);
    }
    const auth = this.auth.getRegistrationStatus();
    return {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      ...(dbError ? { dbError } : {}),
      auth: {
        passwordRegistrationEnabled: auth.passwordRegistrationEnabled,
        googleEnabled: auth.googleEnabled,
        emailDelivery: auth.delivery,
        ...(auth.passwordRegistrationEnabled ? {} : { reasons: auth.reasons }),
      },
      uptimeSeconds: Math.floor((Date.now() - this.bootedAt) / 1000),
      version: process.env.APP_VERSION ?? 'dev',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async ready() {
    await this.prisma.$queryRawUnsafe('SELECT 1');
    return { ready: true };
  }
}
