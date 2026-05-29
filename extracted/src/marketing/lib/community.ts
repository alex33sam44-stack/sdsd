import { dataClient } from "@/marketing/integrations/data/client";
import type { Station, StationType } from "@/marketing/lib/stations";

export const CONFIRMATIONS_REQUIRED = 5;

export type CommunityStation = Station & {
  confirmations_count: number;
  user_id: string;
  isCommunity: true;
};

export async function fetchCommunityStations(): Promise<CommunityStation[]> {
  const { data, error } = await dataClient
    .from("user_stations")
    .select("id, user_id, name, type, lines, lat, lng, confirmations_count")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: `c:${r.id}`,
    name: r.name,
    lat: r.lat as number,
    lng: r.lng as number,
    type: r.type as StationType,
    lines: (r.lines as string[]) ?? [],
    confirmations_count: r.confirmations_count as number,
    user_id: r.user_id as string,
    isCommunity: true as const,
  }));
}

export async function fetchMyConfirmations(userId: string): Promise<Set<string>> {
  const { data, error } = await dataClient
    .from("station_confirmations")
    .select("station_id")
    .eq("user_id", userId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.station_id as string));
}

export async function addStation(input: {
  user_id: string;
  name: string;
  type: StationType;
  lines: string[];
  lat: number;
  lng: number;
}) {
  const { error } = await dataClient.from("user_stations").insert(input);
  if (error) throw error;
}

export async function confirmStation(stationDbId: string, userId: string) {
  const { error } = await dataClient
    .from("station_confirmations")
    .insert({ station_id: stationDbId, user_id: userId });
  if (error) throw error;
}
