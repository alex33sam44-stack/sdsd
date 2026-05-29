import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeBus } from './realtime.bus';
import type {
  AvailabilityPayload,
  LineStatusPayload,
  RealtimeChannel,
  RealtimeEvent,
  StationSummaryPayload,
  TripEtaPayload,
} from './realtime.types';

/**
 * Realtime façade used by other modules to publish events without
 * having to know about the RealtimeBus implementation. Also serves
 * the optional "seed" event that hydrates new SSE subscribers with
 * the current snapshot of their channel.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: RealtimeBus,
  ) {}

  /**
   * Publish a microbus availability flip. Called by the lines
   * service whenever an operator updates `cars` or `status`. The
   * existing `lines.setAvailability` keeps writing to the
   * `availability_logs` table; this method just amplifies the
   * change to live subscribers.
   */
  publishAvailability(payload: AvailabilityPayload, tenantId: string | null): RealtimeEvent {
    const ev = this.bus.emit(
      'availability',
      'line',
      payload.lineId,
      tenantId,
      payload,
    );
    // Also fan out to the station channel so a station-level subscriber
    // doesn't have to subscribe to every line individually.
    this.bus.emit('availability', 'station', payload.stationId, tenantId, payload);
    return ev;
  }

  publishLineStatus(payload: LineStatusPayload, tenantId: string | null): RealtimeEvent {
    return this.bus.emit('line.status', 'line', payload.lineId, tenantId, payload);
  }

  publishTripEta(payload: TripEtaPayload, tenantId: string | null): RealtimeEvent {
    return this.bus.emit('trip.eta', 'trip', payload.token, tenantId, payload);
  }

  publishStationSummary(payload: StationSummaryPayload, tenantId: string | null): RealtimeEvent {
    return this.bus.emit('station.summary', 'station', payload.stationId, tenantId, payload);
  }

  /**
   * Returns the most recent state for the requested channel/subject
   * so a freshly opened SSE connection has something to render
   * before the next live event arrives.
   */
  async seed(
    channel: RealtimeChannel,
    id: string,
    tenantId: string | null,
  ): Promise<RealtimeEvent | null> {
    try {
      if (channel === 'line') return await this.seedLine(id, tenantId);
      if (channel === 'station') return await this.seedStation(id, tenantId);
      return null;
    } catch (err) {
      this.logger.warn(`seed(${channel}:${id}) failed: ${(err as Error).message}`);
      return null;
    }
  }

  private async seedLine(lineId: string, tenantId: string | null): Promise<RealtimeEvent | null> {
    const line = await this.prisma.line.findFirst({
      where: { id: lineId, ...(tenantId ? { tenantId } : {}) },
      select: { id: true, stationId: true, cars: true, status: true },
    });
    if (!line) return null;
    const payload: AvailabilityPayload = {
      lineId: line.id,
      stationId: line.stationId,
      cars: line.cars,
      status: line.status as string,
    };
    return {
      id: `seed-line-${line.id}`,
      type: 'availability',
      channel: 'line',
      subjectId: line.id,
      ts: new Date().toISOString(),
      tenantId,
      data: payload,
    };
  }

  private async seedStation(stationId: string, tenantId: string | null): Promise<RealtimeEvent | null> {
    const lines = await this.prisma.line.findMany({
      where: { stationId, ...(tenantId ? { tenantId } : {}) },
      select: { id: true, status: true, cars: true, isPublished: true },
    });
    if (!lines.length) return null;
    const active = lines.filter((l) => l.status === 'active' && l.isPublished).length;
    const totalCars = lines.reduce((sum, l) => sum + (l.cars ?? 0), 0);
    const payload: StationSummaryPayload = {
      stationId,
      totalLines: lines.length,
      activeLines: active,
      totalCars,
    };
    return {
      id: `seed-station-${stationId}`,
      type: 'station.summary',
      channel: 'station',
      subjectId: stationId,
      ts: new Date().toISOString(),
      tenantId,
      data: payload,
    };
  }
}
