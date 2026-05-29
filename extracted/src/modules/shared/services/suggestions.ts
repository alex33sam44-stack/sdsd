// Loads the raw signals required by the suggestions engine.
// Fully self-hosted: derives suggestions from current REST-backed station/line/
// stop/zone data plus local recent-search trends.
import { adminListAllStations } from "./stations";
import { listAdminLinesByStation } from "./lines";
import { listZones } from "./layout";
import { loadTrendingSearches } from "./liveOps";
import { coerceLineStatus } from "./enums";
import {
  buildSuggestions,
  type LineRow,
  type StopRow,
  type ZoneRow,
  type Suggestion,
} from "./suggestionsEngine";

export type SuggestionsBundle = {
  fetchedAt: string;
  suggestions: Suggestion[];
};

export async function loadSuggestions(): Promise<SuggestionsBundle> {
  const stations = await adminListAllStations();
  const stationNameById = new Map<string, string>(stations.map((s) => [s.id, s.name]));

  const stationDetails = await Promise.all(
    stations.map(async (station) => ({
      station,
      lines: await listAdminLinesByStation(station.id),
      zones: await listZones(station.id).catch(() => []),
    })),
  );

  const lines: LineRow[] = [];
  const stops: StopRow[] = [];
  const zones: ZoneRow[] = [];

  for (const { station, lines: stationLines, zones: stationZones } of stationDetails) {
    for (const line of stationLines) {
      lines.push({
        id: line.id,
        station_id: station.id,
        destination: line.destination,
        status: coerceLineStatus(line.status) ?? "active",
        cars: Number(line.cars ?? 0),
        is_published: Boolean(line.is_published),
        cars_updated_at: line.cars_updated_at ?? line.updated_at ?? new Date().toISOString(),
        pickup_area: line.pickup_area ?? null,
        zone_x: line.zone_x ?? null,
        zone_y: line.zone_y ?? null,
        zone_w: line.zone_w ?? null,
        zone_h: line.zone_h ?? null,
      });
      for (const stop of line.stops ?? []) {
        stops.push({
          id: stop.id,
          line_id: line.id,
          position: stop.position,
          name: stop.name,
        });
      }
    }

    for (const zone of stationZones) {
      zones.push({
        id: zone.id,
        station_id: station.id,
        zone_key: zone.zone_key,
        label: zone.label ?? null,
      });
    }
  }

  const suggestions = buildSuggestions({
    lines,
    stops,
    zones,
    searches: await loadTrendingSearches(300),
    stationNameById,
  });

  return { fetchedAt: new Date().toISOString(), suggestions };
}
