// ---------------------------------------------------------------------------
// Transport mode — canonical classification across formal + informal mobility.
//
// Backward compatibility:
//   - The DB column `lines.transport_mode` is nullable. A trigger backfills
//     it from the existing Arabic `vehicle_type` enum on every insert/update.
//   - This module exposes the same mapping in TypeScript so client code can
//     show mode labels even when the column is missing (legacy seed data).
// ---------------------------------------------------------------------------

export const TRANSPORT_MODES = [
  "bus",
  "microbus",
  "minibus",
  "station_taxi",
  "community",
] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

export const STOP_CLASSES = ["formal", "semi_formal", "informal"] as const;
export type StopClass = (typeof STOP_CLASSES)[number];

/** Arabic vehicle_type → canonical mode (mirrors transport_mode_from_vehicle SQL). */
const ARABIC_VEHICLE_TO_MODE: Record<string, TransportMode> = {
  "أتوبيس": "bus",
  "ميكروباص": "microbus",
  "ميني باص": "minibus",
  "تاكسي موقف": "station_taxi",
};

export function deriveTransportMode(input: {
  transport_mode?: string | null;
  vehicle_type?: string | null;
  vehicleType?: string | null;
}): TransportMode {
  const explicit = (input.transport_mode ?? "").trim().toLowerCase();
  if ((TRANSPORT_MODES as readonly string[]).includes(explicit)) {
    return explicit as TransportMode;
  }
  const vt = (input.vehicle_type ?? input.vehicleType ?? "").trim();
  return ARABIC_VEHICLE_TO_MODE[vt] ?? "microbus";
}

export function isFormal(mode: TransportMode): boolean {
  return mode === "bus";
}

/** i18n keys (resolved by t() in the UI) for each mode. */
export const MODE_LABEL_KEY: Record<TransportMode, string> = {
  bus: "transportMode.bus",
  microbus: "transportMode.microbus",
  minibus: "transportMode.minibus",
  station_taxi: "transportMode.stationTaxi",
  community: "transportMode.community",
};

export const MODE_BADGE_KEY: Record<TransportMode, string> = {
  bus: "transportMode.badge.formal",
  microbus: "transportMode.badge.informal",
  minibus: "transportMode.badge.informal",
  station_taxi: "transportMode.badge.semiFormal",
  community: "transportMode.badge.community",
};

/**
 * Small ranking nudge so a hybrid result list reflects mode reliability.
 * Formal bus gets the largest bump (schedules, fixed stops); community is
 * penalized slightly to reflect lower data confidence. Non-zero ONLY — the
 * existing rank score still dominates so no current ordering is broken.
 */
export function modeRankBoost(mode: TransportMode): number {
  switch (mode) {
    case "bus": return 6;
    case "minibus": return 3;
    case "microbus": return 2;
    case "station_taxi": return 2;
    case "community": return -3;
  }
}
