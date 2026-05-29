import { distanceKm, STATIONS, Station, TaxiLine, Stop } from "@/data/stations";
import { getLineOverrides } from "@/lib/storage";
import { legacyOverridesEnabled } from "@/lib/dataMode";
import {
  scoreResult,
  computeConfidence,
  freshnessCategory,
  explainResult,
  explainConfidence,
  isOperatorConfirmed,
  type ConfidenceLevel,
  type FreshnessCategory,
  type Reason,
} from "@/lib/ranking";
import { deriveTransportMode, modeRankBoost, type TransportMode } from "@/lib/transportMode";


export type ResultLabel =
  | "مباشر"
  | "هتنزل قريب من المكان"
  | "الأقرب لموقعك"
  | "أسرع اختيار"
  | "يحتاج تبديل"
  | "الأفضل الآن";

export type PlanResult = {
  station: Station;
  line: TaxiLine;
  pickupStop: Stop; // boarding stop (usually the station itself)
  dropoffStop: Stop; // best stop near destination
  walkToPickupKm: number;
  walkFromDropoffKm: number; // distance from dropoff to destination
  totalKm: number;
  cars: number;
  isDirect: boolean; // dropoff distance to destination <= DIRECT_THRESHOLD
  labels: ResultLabel[];
  /** Decision-support metadata (additive — UI may ignore). */
  rankScore: number;
  confidence: ConfidenceLevel;
  /** Confidence numeric score (0-100) — exposed for tooltips. */
  confidenceScore: number;
  freshness: FreshnessCategory;
  updatedAt?: string;
  /** True when an operator confirmed this line recently (active + fresh). */
  operatorConfirmed: boolean;
  /** Reason codes for "why this result" — UI maps to i18n. */
  whyResult: Reason[];
  /** Reason codes for "why confidence is X". */
  whyConfidence: Reason[];
  /** True for the top 1-2 recommended results (set after sorting). */
  isTopPick: boolean;
  /** Canonical transport category (formal bus / microbus / minibus / station taxi / community). */
  transportMode: TransportMode;
};

const DIRECT_THRESHOLD_KM = 0.6; // <=600m considered "direct"
const NEAR_THRESHOLD_KM = 1.8; // <=1.8km considered "near destination"

export type Place = { lat: number; lng: number; label?: string };

export function planTrip(origin: Place, destination: Place, stations: Station[] = STATIONS): PlanResult[] {
  // Legacy car-count overrides are honored ONLY in dev mode. In production
  const overrides = legacyOverridesEnabled() ? getLineOverrides() : {};
  const results: PlanResult[] = [];


  for (const station of stations) {
    for (const line of station.lines) {
      // Find best stop on the line near destination
      let bestStop: Stop = line.stops[0];
      let bestDist = Infinity;
      for (const stop of line.stops) {
        const d = distanceKm(stop.lat, stop.lng, destination.lat, destination.lng);
        if (d < bestDist) {
          bestDist = d;
          bestStop = stop;
        }
      }
      // Pickup is the station itself (first stop)
      const pickupStop = line.stops[0] ?? {
        id: station.id,
        name: station.name,
        lat: station.lat,
        lng: station.lng,
      };
      // The dropoff must come AFTER the pickup along the line
      const pickupIndex = line.stops.findIndex((s) => s.id === pickupStop.id);
      const dropoffIndex = line.stops.findIndex((s) => s.id === bestStop.id);
      if (dropoffIndex <= pickupIndex) continue; // line doesn't help reach destination

      if (bestDist > NEAR_THRESHOLD_KM) continue; // not useful

      const walkToPickup = distanceKm(
        origin.lat,
        origin.lng,
        pickupStop.lat,
        pickupStop.lng
      );

      const cars = overrides[line.id]?.cars ?? line.cars;

      const updatedAt = line.updatedAt;
      const lineStatus = (line as { status?: string }).status ?? "active";
      const isDirect = bestDist <= DIRECT_THRESHOLD_KM;
      const transportMode = deriveTransportMode({
        transport_mode: (line as { transport_mode?: string | null }).transport_mode,
        vehicleType: line.vehicleType,
      });
      const rankInput = {
        isDirect,
        walkToPickupKm: walkToPickup,
        walkFromDropoffKm: bestDist,
        cars,
        status: lineStatus,
        updatedAt,
        modeBoost: modeRankBoost(transportMode),
      };
      const { level: confidence, score: confidenceScore } = computeConfidence({
        updatedAt,
        status: lineStatus,
        stopsCount: line.stops.length,
        hasPickupArea: !!line.pickupArea,
      });
      const operatorConfirmed = isOperatorConfirmed({
        status: lineStatus,
        updatedAt,
      });
      const whyConfidence = explainConfidence({
        updatedAt,
        status: lineStatus,
        stopsCount: line.stops.length,
        hasPickupArea: !!line.pickupArea,
      });
      results.push({
        station,
        line,
        pickupStop,
        dropoffStop: bestStop,
        walkToPickupKm: walkToPickup,
        walkFromDropoffKm: bestDist,
        totalKm: walkToPickup + bestDist,
        cars,
        isDirect,
        labels: [],
        rankScore: scoreResult(rankInput),
        confidence,
        confidenceScore,
        freshness: freshnessCategory(updatedAt),
        updatedAt,
        operatorConfirmed,
        whyResult: [], // filled after sorting (needs isTopPick)
        whyConfidence,
        isTopPick: false,
        transportMode,
      });
    }
  }

  // Primary sort: rank score (desc). Tie-break by total walking distance.
  results.sort((a, b) => b.rankScore - a.rankScore || a.totalKm - b.totalKm);

  // Mark top 1-2 picks. Second pick only if its score is within 85% of the
  // top score AND it's a genuinely distinct line (different station OR mode).
  if (results.length > 0) {
    results[0].isTopPick = true;
    if (results.length > 1) {
      const top = results[0];
      const second = results[1];
      const close = second.rankScore >= top.rankScore * 0.85;
      const distinct =
        second.station.id !== top.station.id || second.transportMode !== top.transportMode;
      if (close && distinct) second.isTopPick = true;
    }
  }

  // Now that isTopPick is set, generate per-result rationale.
  for (const r of results) {
    r.whyResult = explainResult({
      isDirect: r.isDirect,
      walkToPickupKm: r.walkToPickupKm,
      walkFromDropoffKm: r.walkFromDropoffKm,
      cars: r.cars,
      status: (r.line as { status?: string }).status ?? "active",
      updatedAt: r.updatedAt,
      confidence: r.confidence,
      isTopPick: r.isTopPick,
      isOperatorConfirmed: r.operatorConfirmed,
    });
  }

  // Assign labels
  if (results.length > 0) {
    // الأفضل الآن = top-ranked
    results[0].labels.push("الأفضل الآن");

    // الأقرب لموقعك = smallest walk to pickup
    const nearestPickup = [...results].sort(
      (a, b) => a.walkToPickupKm - b.walkToPickupKm
    )[0];
    if (!nearestPickup.labels.includes("الأقرب لموقعك")) {
      nearestPickup.labels.push("الأقرب لموقعك");
    }

    // أسرع اختيار = smallest total walking distance (and at least 1 car if available)
    const fastest =
      [...results]
        .filter((r) => r.cars > 0)
        .sort((a, b) => a.totalKm - b.totalKm)[0] ?? results[0];
    if (!fastest.labels.includes("أسرع اختيار")) {
      fastest.labels.push("أسرع اختيار");
    }

    for (const r of results) {
      if (r.isDirect) r.labels.push("مباشر");
      else r.labels.push("هتنزل قريب من المكان");
    }
  }

  return results.slice(0, 8);
}

// Simple local "place" search across stations + stops by Arabic name substring
export type SearchHit = {
  id: string;
  name: string;
  area?: string;
  lat: number;
  lng: number;
  type: "station" | "stop";
};

export function searchPlaces(query: string, stations: Station[] = STATIONS): SearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  for (const s of stations) {
    if (s.name.includes(q) || s.area.includes(q)) {
      const key = `st:${s.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        hits.push({
          id: s.id,
          name: s.name,
          area: s.area,
          lat: s.lat,
          lng: s.lng,
          type: "station",
        });
      }
    }
    for (const line of s.lines) {
      for (const stop of line.stops) {
        if (stop.name.includes(q)) {
          const key = `stop:${stop.id}:${stop.name}`;
          if (!seen.has(key)) {
            seen.add(key);
            hits.push({
              id: stop.id,
              name: stop.name,
              area: s.name,
              lat: stop.lat,
              lng: stop.lng,
              type: "stop",
            });
          }
        }
      }
    }
  }
  return hits.slice(0, 10);
}

export function googleMapsUrl(lat: number, lng: number) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}

export type NearbyStop = {
  stationId: string;
  stationName: string;
  stopId: string;
  stopName: string;
  lat: number;
  lng: number;
  distanceKm: number;
};

// Find known stations/stops near a place (for no-results fallback)
export function findNearbyKnownStops(
  place: Place,
  maxKm = 3,
  limit = 5,
  stations: Station[] = STATIONS
): NearbyStop[] {
  const items: NearbyStop[] = [];
  const seen = new Set<string>();
  for (const s of stations) {
    const dStation = distanceKm(s.lat, s.lng, place.lat, place.lng);
    const stationKey = `st:${s.id}`;
    if (dStation <= maxKm && !seen.has(stationKey)) {
      seen.add(stationKey);
      items.push({
        stationId: s.id,
        stationName: s.name,
        stopId: s.id,
        stopName: s.name,
        lat: s.lat,
        lng: s.lng,
        distanceKm: dStation,
      });
    }
    for (const line of s.lines) {
      for (const stop of line.stops) {
        const key = `stop:${stop.id}:${stop.name}`;
        if (seen.has(key)) continue;
        const d = distanceKm(stop.lat, stop.lng, place.lat, place.lng);
        if (d <= maxKm) {
          seen.add(key);
          items.push({
            stationId: s.id,
            stationName: s.name,
            stopId: stop.id,
            stopName: stop.name,
            lat: stop.lat,
            lng: stop.lng,
            distanceKm: d,
          });
        }
      }
    }
  }
  items.sort((a, b) => a.distanceKm - b.distanceKm);
  return items.slice(0, limit);
}
