import { Controller, Get, Header, HttpException, HttpStatus } from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import * as os from 'node:os';
import { PrismaService } from '../../common/prisma/prisma.service';

interface DeepHealthCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  detail?: string;
  durationMs?: number;
}

interface DeepHealthReport {
  status: 'pass' | 'warn' | 'fail';
  generatedAt: string;
  release: string;
  uptimeSeconds: number;
  process: {
    pid: number;
    nodeVersion: string;
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
  };
  host: {
    loadavg: number[];
    freeMemoryMb: number;
    totalMemoryMb: number;
    cpus: number;
  };
  checks: DeepHealthCheck[];
}

/**
 * Deep health probe — additive companion to /api/health (which stays
 * intentionally minimal so uptime monitors hit it cheaply).
 *
 *   GET /api/health/deep
 *
 * Returns 200 when the platform can serve traffic, 503 when one of
 * the critical checks fails. Designed for ops dashboards, not for
 * uptime monitors that just want a 200/non-200.
 *
 * The legacy /api/health endpoint is untouched.
 */
@Controller('health')
export class HealthDeepController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('deep')
  @Header('Cache-Control', 'no-store')
  @Header('x-i18n-skip', '1')
  async deep(): Promise<DeepHealthReport> {
    const checks: DeepHealthCheck[] = [];

    // 1. DB ping
    const dbStart = performance.now();
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      checks.push({
        name: 'db.ping',
        status: 'pass',
        durationMs: round(performance.now() - dbStart),
      });
    } catch (err) {
      checks.push({
        name: 'db.ping',
        status: 'fail',
        detail: (err as Error).message,
        durationMs: round(performance.now() - dbStart),
      });
    }

    // 2. DB tenant isolation columns present (catches missing migrations)
    try {
      await this.prisma.$queryRawUnsafe(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='stations' AND COLUMN_NAME='tenant_id' LIMIT 1`,
      );
      checks.push({ name: 'db.schema.tenant_id', status: 'pass' });
    } catch (err) {
      checks.push({
        name: 'db.schema.tenant_id',
        status: 'warn',
        detail: 'tenant_id column not detected (information_schema query failed)',
      });
    }

    // 3. New i18n tables present (catches stale schema on a partially-migrated host)
    try {
      const rows = (await this.prisma.$queryRawUnsafe(
        `SELECT TABLE_NAME FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME IN ('translations', 'translation_cache', 'i18n_overrides')`,
      )) as Array<{ TABLE_NAME?: string; table_name?: string }>;
      const found = rows.length;
      checks.push({
        name: 'db.schema.i18n_tables',
        status: found === 3 ? 'pass' : 'warn',
        detail: `found ${found}/3 tables`,
      });
    } catch {
      checks.push({ name: 'db.schema.i18n_tables', status: 'warn', detail: 'schema query failed' });
    }

    // 4. Memory headroom
    const mem = process.memoryUsage();
    const heapPct = mem.heapUsed / mem.heapTotal;
    checks.push({
      name: 'process.heap',
      status: heapPct > 0.9 ? 'warn' : 'pass',
      detail: `heapUsed/heapTotal=${(heapPct * 100).toFixed(0)}%`,
    });

    // 5. Host load average vs CPU count
    const cpus = os.cpus().length || 1;
    const load1 = os.loadavg()[0] ?? 0;
    checks.push({
      name: 'host.loadavg',
      status: load1 > cpus * 2 ? 'warn' : 'pass',
      detail: `1m=${load1.toFixed(2)} vs cpus=${cpus}`,
    });

    // 6. Free memory ≥ 256 MB
    const freeMb = os.freemem() / (1024 * 1024);
    checks.push({
      name: 'host.free-memory',
      status: freeMb < 256 ? 'warn' : 'pass',
      detail: `${freeMb.toFixed(0)} MB free`,
    });

    const status: DeepHealthReport['status'] = checks.some((c) => c.status === 'fail')
      ? 'fail'
      : checks.some((c) => c.status === 'warn')
        ? 'warn'
        : 'pass';

    const report: DeepHealthReport = {
      status,
      generatedAt: new Date().toISOString(),
      release: process.env.APP_VERSION ?? 'dev',
      uptimeSeconds: Math.round(process.uptime()),
      process: {
        pid: process.pid,
        nodeVersion: process.version,
        rssMb: round(mem.rss / 1024 / 1024),
        heapUsedMb: round(mem.heapUsed / 1024 / 1024),
        heapTotalMb: round(mem.heapTotal / 1024 / 1024),
      },
      host: {
        loadavg: os.loadavg(),
        freeMemoryMb: Math.round(os.freemem() / 1024 / 1024),
        totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
        cpus,
      },
      checks,
    };

    if (status === 'fail') {
      throw new HttpException(report, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return report;
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
