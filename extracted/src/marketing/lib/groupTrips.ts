import { dataClient } from "@/marketing/integrations/data/client";

export type GroupTripInput = {
  title: string;
  from_location: string;
  to_location: string;
  transport?: string;
  depart_at: string; // ISO
  notes?: string;
};

export type PublicGroupTrip = {
  id: string;
  title: string;
  from_location: string;
  to_location: string;
  transport: string | null;
  depart_at: string;
  notes: string | null;
  is_closed: boolean;
  creator_name: string;
  joins_count: number;
  created_at: string;
};

export type GroupJoin = { display_name: string; created_at: string };

export async function createGroupTrip(input: GroupTripInput): Promise<string> {
  const { data: u } = await dataClient.auth.getUser();
  if (!u.user) throw new Error("لازم تسجل دخول الأول");
  const { data, error } = await dataClient
    .from("group_trips")
    .insert({ ...input, creator_id: u.user.id })
    .select("share_token")
    .single();
  if (error) throw error;
  return data.share_token as string;
}

export async function fetchPublicGroupTrip(token: string): Promise<PublicGroupTrip | null> {
  const { data, error } = await dataClient.rpc("get_public_group_trip", { _token: token });
  if (error) throw error;
  const row = (data as PublicGroupTrip[] | null)?.[0] ?? null;
  return row;
}

export async function fetchPublicGroupJoins(token: string): Promise<GroupJoin[]> {
  const { data, error } = await dataClient.rpc("get_public_group_joins", { _token: token });
  if (error) throw error;
  return (data as GroupJoin[]) ?? [];
}

export async function joinGroupTrip(token: string): Promise<void> {
  const { error } = await dataClient.rpc("join_group_trip_by_token", { _token: token });
  if (error) throw error;
}

export function buildGroupTripUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/g/${encodeURIComponent(token)}`;
}

export function buildWhatsAppShare(trip: PublicGroupTrip, url: string): string {
  const when = new Date(trip.depart_at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
  const text =
    `🚌 ${trip.title}\n` +
    `من ${trip.from_location} → ${trip.to_location}\n` +
    `⏰ ${when}${trip.transport ? ` • ${trip.transport}` : ""}\n` +
    `${trip.joins_count} حد ماشي معايا\n\nأنا كمان؟ 👇\n${url}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
