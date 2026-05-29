// React Query hooks that read from the REST backend (`/stations`).
// No seed fallback and no secondary data path: the self-hosted backend is the
// single source of truth.
import { useQuery } from "@tanstack/react-query";
import {
  findNearestStation as findNearestRest,
  getStationWithLines,
  listPublishedStations,
} from "@/modules/shared/services/stations";
import { adaptStation } from "@/modules/shared/services/seedAdapter";
import { timeFlow } from "@/lib/perf";
import { ApiError } from "@/lib/api";
import type { Station as LegacyStation } from "@/data/stations";

const STALE = 60_000;

export function useStations() {
  return useQuery<LegacyStation[]>({
    queryKey: ["stations:list"],
    staleTime: STALE,
    retry: (failureCount, error: unknown) => {
      if (failureCount >= 4) return false;
      if (error instanceof ApiError) {
        if (error.status === 0 || error.status >= 500) return true;
      }
      return failureCount < 2;
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    queryFn: async () => {
      const rows = await listPublishedStations();
      return rows.map((s) => ({
        id: s.id,
        name: s.name,
        area: s.area ?? "",
        lat: Number(s.lat),
        lng: Number(s.lng),
        lines: [],
      }));
    },
  });
}

export function useStation(stationId: string | undefined) {
  return useQuery<LegacyStation | null>({
    queryKey: ["stations:detail", stationId],
    enabled: !!stationId,
    staleTime: STALE,
    queryFn: async () => {
      if (!stationId) return null;
      const station = await timeFlow("station.load", () => getStationWithLines(stationId));
      return station ? adaptStation(station) : null;
    },
  });
}

export async function findNearestStationHybrid(lat: number, lng: number) {
  return findNearestRest(lat, lng);
}
