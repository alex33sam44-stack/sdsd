import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  RealtimeChannel,
  RealtimeEvent,
  RealtimeEventType,
} from './realtime.types';

type Listener = (event: RealtimeEvent) => void;

interface BusOptions {
  /** Maximum subscribers per process. Beyond this, new connections are rejected. */
  maxSubscribers: number;
  /** Per-IP soft cap (used by the controller before opening a stream). */
  maxPerIp: number;
}

/**
 * In-process pub/sub for realtime events.
 *
 * For a single-instance deployment (the default self-host VPS) this
 * is sufficient. For horizontally scaled deployments operators
 * should swap this for a Redis/NATS adapter that re-publishes
 * `bus.emit(...)` calls across nodes; the public surface stays the
 * same so callers never need to change.
 */
@Injectable()
export class RealtimeBus {
  private readonly logger = new Logger(RealtimeBus.name);
  private readonly listeners = new Map<string, { listener: Listener; ip: string }>();
  private readonly perIp = new Map<string, number>();
  private seq = 0;
  readonly opts: BusOptions = {
    maxSubscribers: Number(process.env.REALTIME_MAX_SUBSCRIBERS ?? 2000),
    maxPerIp: Number(process.env.REALTIME_MAX_PER_IP ?? 8),
  };

  /**
   * Register a listener. The returned token is needed to detach.
   * Throws when capacity is reached so the controller can return
   * 503 to the client.
   */
  attach(ip: string, listener: Listener): string {
    if (this.listeners.size >= this.opts.maxSubscribers) {
      throw new Error('subscriber limit reached');
    }
    const ipCount = this.perIp.get(ip) ?? 0;
    if (ipCount >= this.opts.maxPerIp) {
      throw new Error('subscriber limit per ip reached');
    }
    const token = randomUUID();
    this.listeners.set(token, { listener, ip });
    this.perIp.set(ip, ipCount + 1);
    return token;
  }

  detach(token: string): void {
    const entry = this.listeners.get(token);
    if (!entry) return;
    this.listeners.delete(token);
    const next = (this.perIp.get(entry.ip) ?? 1) - 1;
    if (next <= 0) this.perIp.delete(entry.ip);
    else this.perIp.set(entry.ip, next);
  }

  /**
   * Emit an event to every listener. The controller filters to the
   * subscribed channel/subject so non-matching listeners ignore it.
   * O(N) per emit; with N≤2000 and emit frequency ≤10/s this is
   * comfortably under 1ms total per emit.
   */
  emit<T>(
    type: RealtimeEventType,
    channel: RealtimeChannel,
    subjectId: string,
    tenantId: string | null,
    data: T,
  ): RealtimeEvent<T> {
    this.seq += 1;
    const event: RealtimeEvent<T> = {
      id: `${process.pid}-${this.seq}`,
      type,
      channel,
      tenantId,
      subjectId,
      ts: new Date().toISOString(),
      data,
    };
    for (const { listener } of this.listeners.values()) {
      try {
        listener(event);
      } catch (err) {
        this.logger.warn(`realtime listener threw: ${(err as Error).message}`);
      }
    }
    return event;
  }

  /** Operational metrics used by /api/realtime/stats. */
  stats(): { subscribers: number; perIp: number; capacity: number } {
    return {
      subscribers: this.listeners.size,
      perIp: this.perIp.size,
      capacity: this.opts.maxSubscribers,
    };
  }
}
