/**
 * Realtime (SSE) domain types.
 *
 * The platform exposes a long-lived Server-Sent Events stream so the
 * frozen frontend can show live availability updates (cars at a
 * stop, line status changes, traffic flips, share-trip ETA ticks)
 * without polling /api/stations every few seconds.
 *
 * SSE — not WebSocket — was chosen because:
 *   - Caddy proxies it natively with no special config.
 *   - Mobile networks reconnect cleanly with EventSource.
 *   - Authentication uses the same JWT cookie/header as the rest of
 *     the API; no separate handshake state.
 *   - It is one-way (server → client), which matches our actual
 *     traffic shape: the server pushes flips, the client never
 *     needs to push anything back over the same channel.
 */
export type RealtimeChannel = 'station' | 'line' | 'tenant' | 'trip';

export type RealtimeEventType =
  | 'hello'
  | 'heartbeat'
  | 'availability'
  | 'line.status'
  | 'trip.eta'
  | 'station.summary';

export interface RealtimeEvent<T = unknown> {
  /** Server-assigned monotonically increasing identifier per process. */
  id: string;
  type: RealtimeEventType;
  channel: RealtimeChannel;
  /** ISO 8601 emission timestamp. */
  ts: string;
  /** Tenant scope for the event (null = platform-wide announcement). */
  tenantId: string | null;
  /** Subject id within the channel (line id, station id, trip token, …). */
  subjectId: string;
  data: T;
}

export interface AvailabilityPayload {
  lineId: string;
  stationId: string;
  cars: number;
  status: 'active' | 'paused' | 'closed' | string;
  changedBy?: string | null;
}

export interface LineStatusPayload {
  lineId: string;
  stationId: string;
  status: 'active' | 'paused' | 'closed' | string;
  reason?: string;
}

export interface TripEtaPayload {
  token: string;
  /** Minutes remaining (rounded). */
  etaMinutes: number;
  lat?: number;
  lng?: number;
}

export interface StationSummaryPayload {
  stationId: string;
  totalLines: number;
  activeLines: number;
  totalCars: number;
}
