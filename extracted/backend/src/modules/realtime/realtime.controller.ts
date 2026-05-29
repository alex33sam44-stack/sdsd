import {
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RealtimeBus } from './realtime.bus';
import { RealtimeService } from './realtime.service';
import type { RealtimeChannel, RealtimeEvent } from './realtime.types';

const VALID_CHANNELS: readonly RealtimeChannel[] = ['station', 'line', 'tenant', 'trip'] as const;
const HEARTBEAT_MS = 25_000;

/**
 * SSE endpoints.
 *
 *   GET /api/realtime/stream?channel=station&id=<id>     — open stream
 *   GET /api/realtime/stats                              — operator metrics
 *
 * The stream emits four event types during its lifetime:
 *   - `hello`       — first event, carries server identity + retry hint
 *   - `availability`/`line.status`/`trip.eta`/`station.summary`
 *   - `heartbeat`   — every 25s so proxies keep the socket open
 *
 * Reconnect semantics: clients should respect the `retry: 3000` hint
 * sent in `hello`. EventSource automatically re-opens the connection
 * on a clean close, sending `Last-Event-ID` so we could resume from
 * a buffer; the current implementation does not buffer and assumes
 * clients are happy to receive only events emitted after reconnect.
 */
@Controller('realtime')
export class RealtimeController {
  constructor(
    private readonly bus: RealtimeBus,
    private readonly service: RealtimeService,
  ) {}

  @Get('stats')
  @Header('Cache-Control', 'no-store')
  stats() {
    return { ok: true, ...this.bus.stats() };
  }

  @Get('stream')
  async stream(
    @Req() req: Request,
    @Res() res: Response,
    @Query('channel') channelRaw?: string,
    @Query('id') id?: string,
  ): Promise<void> {
    const channel = (VALID_CHANNELS as readonly string[]).includes(channelRaw ?? '')
      ? (channelRaw as RealtimeChannel)
      : null;
    if (!channel || !id) {
      throw new HttpException('channel and id are required', HttpStatus.BAD_REQUEST);
    }

    // SSE protocol headers + immediate flush so proxies don't buffer.
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const ip = (req.ip ?? req.socket.remoteAddress ?? 'unknown').toString();
    let token: string;
    try {
      token = this.bus.attach(ip, (event) => {
        if (!matches(event, channel, id, (req as any).tenantId ?? null)) return;
        writeEvent(res, event);
      });
    } catch (err) {
      throw new HttpException((err as Error).message, HttpStatus.SERVICE_UNAVAILABLE);
    }

    writeEvent(res, {
      id: `${process.pid}-hello`,
      type: 'hello',
      channel,
      subjectId: id,
      ts: new Date().toISOString(),
      tenantId: (req as any).tenantId ?? null,
      data: {
        protocol: 'sse',
        retry: 3000,
        heartbeatMs: HEARTBEAT_MS,
        capacity: this.bus.stats().capacity,
      },
    });

    // Optionally seed the stream with the most recent snapshot so
    // the SPA renders something on first paint.
    const seed = await this.service.seed(channel, id, (req as any).tenantId ?? null);
    if (seed) writeEvent(res, seed);

    const heartbeat = setInterval(() => {
      writeEvent(res, {
        id: `${process.pid}-hb-${Date.now()}`,
        type: 'heartbeat',
        channel,
        subjectId: id,
        ts: new Date().toISOString(),
        tenantId: (req as any).tenantId ?? null,
        data: {},
      });
    }, HEARTBEAT_MS);

    const closeHandler = () => {
      clearInterval(heartbeat);
      this.bus.detach(token);
    };
    req.on('close', closeHandler);
    req.on('end', closeHandler);
  }
}

function matches(
  event: RealtimeEvent,
  channel: RealtimeChannel,
  id: string,
  tenantId: string | null,
): boolean {
  if (event.channel !== channel) return false;
  if (tenantId && event.tenantId && event.tenantId !== tenantId) return false;
  if (event.subjectId !== id && channel !== 'tenant') return false;
  return true;
}

function writeEvent(res: Response, event: RealtimeEvent): void {
  res.write(`id: ${event.id}\n`);
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}
