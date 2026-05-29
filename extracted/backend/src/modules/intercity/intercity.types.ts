/**
 * Intercity transit domain types.
 *
 * Models the long-haul layer: Cairo↔Alexandria, Cairo↔Mansoura, …
 * Each route is owned by a carrier (private microbus, GoBus, Super
 * Jet, شركة …) and carries fare ranges + schedules + amenities.
 *
 * Tenant scope is optional: a `null` tenantId means a platform-wide
 * intercity record curated by the operator team. Tenant-owned rows
 * shadow platform rows when both exist on the same city pair.
 */
export type IntercityVehicle = 'bus' | 'minibus' | 'microbus' | 'train' | 'shared_taxi';

export interface IntercityScheduleEntry {
  id: string;
  /** Local time, "HH:mm". */
  departTime: string;
  arriveTime?: string;
  /** Days of week as a string of digits 1..7 (1 = Monday, 7 = Sunday). */
  daysOfWeek: string;
  seatsTotal?: number;
  notes?: string;
}

export interface IntercityRouteRecord {
  id: string;
  tenantId: string | null;
  fromCityId: string;
  toCityId: string;
  carrier: string;
  vehicleType: IntercityVehicle;
  distanceKm?: number;
  durationMinutes?: number;
  fareMin?: number;
  fareMax?: number;
  currency: string;
  frequencyLabel?: string;
  amenities: string[];
  isPublished: boolean;
  schedules: IntercityScheduleEntry[];
}

export interface IntercitySearchQuery {
  from?: string;
  to?: string;
  carrier?: string;
  vehicleType?: IntercityVehicle;
  /** Only include routes with at least one schedule on this 1..7 day. */
  day?: number;
  /** Only include routes departing at/after this "HH:mm". */
  afterTime?: string;
  limit?: number;
}
