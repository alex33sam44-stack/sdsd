// ---------------------------------------------------------------------------
// Station-level passenger guidance helpers.
//
// Coordinate model:
//   The interactive station SVG uses a 100x100 viewBox. We assume an
//   average urban taxi station footprint of ~80m x 60m, so:
//
//      1 SVG unit on X ≈ 0.80 m
//      1 SVG unit on Y ≈ 0.60 m
//
//   Walking pace is taken at 1.2 m/s (slow pedestrian — passenger with
//   luggage in a crowded station). All durations round UP to the next
//   30-second bucket, never below "أقل من دقيقة" if > 0s.
// ---------------------------------------------------------------------------

import { distanceKm } from "@/data/stations";

export const SVG_M_PER_UNIT_X = 0.8;
export const SVG_M_PER_UNIT_Y = 0.6;
export const WALK_M_PER_SEC = 1.2;

/** Entrance position inside the SVG (matches StationMap.tsx). */
export const ENTRANCE_SVG = { x: 96, y: 50 } as const;

export type SvgPoint = { x: number; y: number };
export type Zone = { x: number; y: number; w: number; h: number };

export type LocationConfidence = "high" | "medium" | "low" | "unknown";

export type DirectionHint =
  | "enter_main_gate"
  | "turn_right"
  | "turn_left"
  | "go_forward"
  | "platform_ahead";

export const DIRECTION_HINT_KEY: Record<DirectionHint, string> = {
  enter_main_gate: "guidance.hintEnter",
  turn_right: "guidance.hintRight",
  turn_left: "guidance.hintLeft",
  go_forward: "guidance.hintForward",
  platform_ahead: "guidance.hintPlatformAhead",
};

/** Center point of a bay rect. */
export function zoneCenter(z: Zone): SvgPoint {
  return { x: z.x + z.w / 2, y: z.y + z.h / 2 };
}

/** Distance between two SVG points, returned in meters. */
export function svgDistanceMeters(a: SvgPoint, b: SvgPoint): number {
  const dxM = (b.x - a.x) * SVG_M_PER_UNIT_X;
  const dyM = (b.y - a.y) * SVG_M_PER_UNIT_Y;
  return Math.sqrt(dxM * dxM + dyM * dyM);
}

/**
 * Estimate walking time, in seconds, from a starting SVG point (entrance by
 * default) to the bay center. We add a 25% slack for crowd / detours.
 */
export function estimateBayWalkSeconds(zone: Zone, from: SvgPoint = ENTRANCE_SVG): number {
  const meters = svgDistanceMeters(from, zoneCenter(zone)) * 1.25;
  const sec = meters / WALK_M_PER_SEC;
  return Math.round(sec);
}

/**
 * Format walking duration in the active locale. Arabic gets purpose-written
 * phrasing; non-Arabic falls back to a simple "~N min" form.
 */
export function formatWalkDuration(seconds: number, locale = "ar"): string {
  const isAr = locale.startsWith("ar");
  if (seconds <= 0) return isAr ? "أقل من دقيقة" : "less than a minute";
  if (seconds < 60) return isAr ? "أقل من دقيقة" : "less than a minute";
  const mins = Math.max(1, Math.round(seconds / 60));
  if (isAr) {
    if (mins === 1) return "حوالي دقيقة";
    if (mins === 2) return "حوالي دقيقتين";
    if (mins <= 10) return `حوالي ${mins} دقائق`;
    return `حوالي ${mins} دقيقة`;
  }
  return `~${mins} min`;
}

/**
 * Pick a direction hint. We compare the bay center to the starting point in
 * SVG coordinates — note the SVG +x axis points VISUALLY right (LTR), but
 * because the station entrance lives on the right (x≈96), "into the station"
 * means decreasing x. We translate accordingly.
 */
export function directionHint(zone: Zone, from: SvgPoint = ENTRANCE_SVG): DirectionHint {
  const c = zoneCenter(zone);
  const dxIntoStation = from.x - c.x; // positive = bay is deeper inside (to the visual left)
  const dy = c.y - from.y; // positive = bay is below the start

  // From the entrance specifically, prefer "enter the main gate" framing for
  // bays that are very close.
  if (from === ENTRANCE_SVG && Math.abs(dxIntoStation) < 8 && Math.abs(dy) < 8) {
    return "platform_ahead";
  }
  if (from === ENTRANCE_SVG && dxIntoStation < 6) {
    return "enter_main_gate";
  }

  // Use whichever axis dominates.
  if (Math.abs(dy) > Math.abs(dxIntoStation) * 0.6) {
    // Vertical movement dominates → right (down the page) / left (up).
    return dy > 0 ? "turn_right" : "turn_left";
  }
  return "go_forward";
}

// ---------------------------------------------------------------------------
// Location confidence
// ---------------------------------------------------------------------------
//   high    : accuracy ≤ 25 m AND user is within ~80 m of the station center
//   medium  : accuracy ≤ 60 m AND user within ~250 m
//   low     : accuracy ≤ 200 m AND user within ~1 km
//   unknown : no fix, or far away / huge accuracy ring
// ---------------------------------------------------------------------------
export function locationConfidence(
  accuracyMeters: number | null | undefined,
  distanceFromStationMeters: number | null | undefined
): LocationConfidence {
  if (accuracyMeters == null || distanceFromStationMeters == null) return "unknown";
  if (!Number.isFinite(accuracyMeters) || !Number.isFinite(distanceFromStationMeters)) {
    return "unknown";
  }
  if (accuracyMeters <= 25 && distanceFromStationMeters <= 80) return "high";
  if (accuracyMeters <= 60 && distanceFromStationMeters <= 250) return "medium";
  if (accuracyMeters <= 200 && distanceFromStationMeters <= 1000) return "low";
  return "unknown";
}

export const CONFIDENCE_LABEL_KEY: Record<LocationConfidence, string> = {
  high: "guidance.confHigh",
  medium: "guidance.confMedium",
  low: "guidance.confLow",
  unknown: "guidance.confUnknown",
};

/**
 * Project a user lat/lng onto the station's SVG viewBox.
 * Only returns a point when confidence is medium or higher — at low/unknown
 * confidence we deliberately fall back to entrance-based guidance instead of
 * pretending precision.
 *
 * Mapping is deliberately rough: we treat the station as an 80m x 60m box
 * centered on (station.lat, station.lng), with the SVG entrance on the
 * +X side. We DON'T attempt true geographic alignment — there is no
 * per-station rotation metadata yet (see follow-ups).
 */
export function projectUserToSvg(
  userLat: number,
  userLng: number,
  station: { lat: number; lng: number },
  accuracyMeters: number
): { point: SvgPoint; confidence: LocationConfidence } {
  const distKm = distanceKm(userLat, userLng, station.lat, station.lng);
  const distM = distKm * 1000;
  const confidence = locationConfidence(accuracyMeters, distM);
  if (confidence === "low" || confidence === "unknown") {
    return { point: ENTRANCE_SVG, confidence };
  }
  // Convert the offset (meters) to SVG units. North = up = -y on screen.
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * Math.cos((station.lat * Math.PI) / 180);
  const dxM = (userLng - station.lng) * metersPerDegLng; // east is +x in world
  const dyM = (userLat - station.lat) * metersPerDegLat; // north is +y in world
  // SVG: +x right, +y down. Without rotation metadata, map east → +x, north → -y.
  let sx = 50 + dxM / SVG_M_PER_UNIT_X;
  let sy = 50 - dyM / SVG_M_PER_UNIT_Y;
  // Clamp inside the viewBox so the marker always stays visible.
  sx = Math.max(2, Math.min(98, sx));
  sy = Math.max(2, Math.min(98, sy));
  return { point: { x: sx, y: sy }, confidence };
}
