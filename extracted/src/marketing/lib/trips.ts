import { dataClient } from "@/marketing/integrations/data/client";
import { trackGrowthEvent } from "@/marketing/lib/growth";

export type Trip = {
  id: string;
  user_id: string;
  share_token: string;
  from_location: string;
  to_location: string;
  transport: string | null;
  notes: string | null;
  status: string;
  last_lat: number | null;
  last_lng: number | null;
  last_ping_at: string | null;
  started_at: string;
  ended_at: string | null;
};

export type SharedTrip = {
  id: string;
  from_location: string;
  to_location: string;
  transport: string | null;
  notes: string | null;
  status: string;
  last_lat: number | null;
  last_lng: number | null;
  last_ping_at: string | null;
  started_at: string;
  ended_at: string | null;
  owner_name: string | null;
};

export async function getActiveTrip(): Promise<Trip | null> {
  const { data: u } = await dataClient.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await dataClient
    .from("trips")
    .select("*")
    .eq("user_id", u.user.id)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Trip | null;
}

export async function startTrip(input: {
  from_location: string;
  to_location: string;
  transport?: string;
  notes?: string;
}): Promise<Trip> {
  const { data: u } = await dataClient.auth.getUser();
  if (!u.user) throw new Error("لازم تسجل دخول الأول");
  const { data, error } = await dataClient
    .from("trips")
    .insert({
      user_id: u.user.id,
      from_location: input.from_location.trim(),
      to_location: input.to_location.trim(),
      transport: input.transport?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Trip;
}

export async function endTrip(tripId: string, status: "completed" | "cancelled" = "completed") {
  const { error } = await dataClient
    .from("trips")
    .update({ status, ended_at: new Date().toISOString() })
    .eq("id", tripId);
  if (error) throw error;
}

export async function sendPing(tripId: string, lat: number, lng: number, accuracy?: number) {
  const { error } = await dataClient
    .from("trip_pings")
    .insert({ trip_id: tripId, lat, lng, accuracy: accuracy ?? null });
  if (error) throw error;
}

export async function getSharedTrip(token: string): Promise<SharedTrip | null> {
  const { data, error } = await dataClient.rpc("get_shared_trip", { _token: token });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as SharedTrip) ?? null;
}

export async function getSharedTripPings(token: string, limit = 50) {
  const { data, error } = await dataClient.rpc("get_shared_trip_pings", { _token: token, _limit: limit });
  if (error) throw error;
  return (data ?? []) as { lat: number; lng: number; created_at: string }[];
}

export function buildShareUrl(token: string): string {
  if (typeof window === "undefined") return `/t/${token}`;
  return `${window.location.origin}/t/${token}`;
}

export function buildWhatsAppShare(token: string, from: string, to: string): string {
  const url = buildShareUrl(token);
  const msg = `أنا في الطريق من ${from} إلى ${to} 🚌\nتابعني لايف هنا: ${url}`;
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

export function trackTripShareCreated(token: string, channel = "whatsapp"): void {
  void trackGrowthEvent("share_trip_created", { token, channel });
}

export function buildOpenMapUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}
