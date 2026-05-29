import { dataClient } from "@/marketing/integrations/data/client";

export type HeatmapPoint = {
  lat: number;
  lng: number;
  type: string;
  weight: number;
};

// In-memory cache (per tab) — heatmap data doesn't need to be real-time fresh
const CACHE_TTL_MS = 30_000; // 30 seconds
let cache: { data: HeatmapPoint[]; at: number } | null = null;
let inflight: Promise<HeatmapPoint[]> | null = null;

export async function fetchPublicHeatmap(force = false): Promise<HeatmapPoint[]> {
  const now = Date.now();
  if (!force && cache && now - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await dataClient.rpc("get_public_heatmap");
      if (error) throw error;
      const points = (data ?? []) as HeatmapPoint[];
      cache = { data: points, at: Date.now() };
      return points;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
