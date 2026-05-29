// Passenger-facing station reads — backed by REST (`/stations`, `/lines`).
import { api } from "@/lib/api";
import { snakify } from "./_camelToSnake";
import type { LineWithStops, Station, StationWithLines } from "../types";

export async function listPublishedStations(): Promise<Station[]> {
  const rows = await api.get<unknown[]>("/stations");
  return snakify<Station[]>(rows);
}

export async function getStationWithLines(stationId: string): Promise<StationWithLines | null> {
  try {
    const data = await api.get<unknown>(`/stations/${stationId}`);
    const station = snakify<StationWithLines>(data);
    // Defensive: ensure stops are sorted by position regardless of API order.
    station.lines = (station.lines ?? []).map((l) => ({
      ...l,
      stops: (l.stops ?? []).slice().sort((a, b) => a.position - b.position),
    }));
    return station;
  } catch (e: any) {
    if (e?.status === 404) return null;
    throw e;
  }
}

export async function getLineWithStops(lineId: string): Promise<LineWithStops | null> {
  try {
    const data = await api.get<unknown>(`/lines/${lineId}`);
    const line = snakify<LineWithStops>(data);
    line.stops = (line.stops ?? []).slice().sort((a, b) => a.position - b.position);
    return line;
  } catch (e: any) {
    if (e?.status === 404) return null;
    throw e;
  }
}

/** Admin-only: list every station including unpublished. */
export async function adminListAllStations(): Promise<Station[]> {
  const rows = await api.get<unknown[]>("/stations/admin/all");
  return snakify<Station[]>(rows);
}

export async function findNearestStation(
  lat: number,
  lng: number,
): Promise<{ station: Station; distance: number } | null> {
  const data = await api.get<unknown>(`/stations/nearest?lat=${lat}&lng=${lng}`);
  if (!data) return null;
  return snakify<{ station: Station; distance: number }>(data);
}



/** Admin-only: read one station including unpublished lines/stops. */
export async function adminGetStationWithLines(stationId: string): Promise<StationWithLines | null> {
  try {
    const data = await api.get<unknown>(`/stations/admin/${stationId}`);
    const station = snakify<StationWithLines>(data);
    station.lines = (station.lines ?? []).map((l) => ({
      ...l,
      stops: (l.stops ?? []).slice().sort((a, b) => a.position - b.position),
    }));
    return station;
  } catch (e: any) {
    if (e?.status === 404) return null;
    throw e;
  }
}
