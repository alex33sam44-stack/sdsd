import { UserContributionStatus, UserContributionType } from '@prisma/client';

/**
 * Payload for POST /contributions. The frontend ships exactly the same shape
 * it stores in localStorage today; the backend stores common columns and keeps
 * the rest as JSON so we don't lock the schema while the form keeps evolving.
 */
export interface CreateContributionDto {
  type: UserContributionType | 'station_line' | 'route_feature';
  stationId?: string | null;
  stationName?: string | null;
  lineId?: string | null;
  lineDestination?: string | null;

  // station_line specific
  destination?: string | null;
  pickupArea?: string | null;
  vehicleType?: string | null;

  // route_feature specific
  kind?: string | null;
  title?: string | null;
  stopName?: string | null;

  // shared
  notes?: string | null;
  contact?: string | null;

  /** Local id from the frontend, kept for matching the response back to the cached entry. */
  clientId?: string | null;
  /** Optional client-side submission timestamp. Server `createdAt` remains authoritative. */
  submittedAt?: string | null;
}

export interface UpdateContributionStatusDto {
  status: UserContributionStatus;
  reviewNote?: string | null;
}

export interface ListContributionsQuery {
  status?: UserContributionStatus;
  type?: UserContributionType;
  stationId?: string;
  lineId?: string;
}
