import { dataClient } from "@/marketing/integrations/data/client";
import { trackGrowthEvent } from "@/marketing/lib/growth";

export const ALERT_TYPES = ["زحمة", "حادثة", "عطل", "تحويلة"] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_META: Record<AlertType, { emoji: string; color: string }> = {
  "زحمة":   { emoji: "🚗", color: "bg-amber-100 text-amber-800 border-amber-200" },
  "حادثة":  { emoji: "⚠️", color: "bg-red-100 text-red-800 border-red-200" },
  "عطل":    { emoji: "🛠️", color: "bg-slate-100 text-slate-800 border-slate-200" },
  "تحويلة": { emoji: "↪️", color: "bg-violet-100 text-violet-800 border-violet-200" },
};

export type Alert = {
  id: string;
  user_id: string;
  type: AlertType;
  location: string;
  line_name: string | null;
  description: string | null;
  lat: number | null;
  lng: number | null;
  confirmations_count: number;
  disputes_count: number;
  is_hidden: boolean;
  expires_at: string;
  created_at: string;
};

export async function fetchAlerts(): Promise<Alert[]> {
  const { data, error } = await dataClient
    .from("alerts")
    .select("*")
    .gt("expires_at", new Date().toISOString())
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as Alert[];
}

export async function disputeAlert(alertId: string): Promise<void> {
  const { data: u } = await dataClient.auth.getUser();
  if (!u.user) throw new Error("لازم تسجل دخول الأول");
  const { error } = await dataClient
    .from("alert_disputes")
    .insert({ alert_id: alertId, user_id: u.user.id });
  if (error) throw error;
}

export async function fetchMyDisputedAlerts(): Promise<Set<string>> {
  const { data: u } = await dataClient.auth.getUser();
  if (!u.user) return new Set();
  const { data } = await dataClient
    .from("alert_disputes")
    .select("alert_id")
    .eq("user_id", u.user.id);
  return new Set((data ?? []).map((r) => r.alert_id as string));
}

export async function createAlert(input: {
  type: AlertType;
  location: string;
  line_name?: string;
  description?: string;
  lat?: number;
  lng?: number;
  mention_codes?: string[];
}): Promise<string> {
  const { data: u } = await dataClient.auth.getUser();
  if (!u.user) throw new Error("لازم تسجل دخول الأول");
  const { data: row, error } = await dataClient.from("alerts").insert({
    user_id: u.user.id,
    type: input.type,
    location: input.location.trim(),
    line_name: input.line_name?.trim() || null,
    description: input.description?.trim() || null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
  }).select("id").single();
  if (error) throw error;
  const alertId = row.id as string;

  void trackGrowthEvent("report_created", { type: input.type, location: input.location.trim(), line_name: input.line_name?.trim() || null });

  if (input.mention_codes && input.mention_codes.length > 0) {
    await mentionUsersByCode(alertId, input.mention_codes);
  }
  return alertId;
}

export async function mentionUsersByCode(alertId: string, codes: string[]): Promise<number> {
  const { data: u } = await dataClient.auth.getUser();
  if (!u.user) throw new Error("لازم تسجل دخول الأول");
  const cleaned = Array.from(new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean)));
  if (cleaned.length === 0) return 0;

  const { data: profs } = await dataClient
    .from("profiles")
    .select("user_id, referral_code")
    .in("referral_code", cleaned);

  const rows = (profs ?? [])
    .filter((p) => p.user_id !== u.user!.id)
    .map((p) => ({
      alert_id: alertId,
      mentioned_user_id: p.user_id,
      mentioned_by: u.user!.id,
    }));
  if (rows.length === 0) return 0;

  const { error } = await dataClient.from("alert_mentions").insert(rows);
  if (error) throw error;
  return rows.length;
}

export async function fetchMentionedAlertIds(): Promise<Set<string>> {
  const { data: u } = await dataClient.auth.getUser();
  if (!u.user) return new Set();
  const { data } = await dataClient
    .from("alert_mentions")
    .select("alert_id")
    .eq("mentioned_user_id", u.user.id);
  return new Set((data ?? []).map((r) => r.alert_id as string));
}

export async function confirmAlert(alertId: string): Promise<void> {
  const { data: u } = await dataClient.auth.getUser();
  if (!u.user) throw new Error("لازم تسجل دخول الأول");
  const { error } = await dataClient
    .from("alert_confirmations")
    .insert({ alert_id: alertId, user_id: u.user.id });
  if (error) throw error;
}

export async function fetchMyConfirmedAlerts(): Promise<Set<string>> {
  const { data: u } = await dataClient.auth.getUser();
  if (!u.user) return new Set();
  const { data, error } = await dataClient
    .from("alert_confirmations")
    .select("alert_id")
    .eq("user_id", u.user.id);
  if (error) return new Set();
  return new Set((data ?? []).map((r) => r.alert_id as string));
}

export function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "الآن";
  if (mins < 60) return `قبل ${mins} د`;
  const hrs = Math.round(mins / 60);
  return `قبل ${hrs} س`;
}

// --- Route matching (free, client-side) ---

function normalizeArabic(s: string): string {
  return s
    .toLowerCase()
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string | null | undefined): string[] {
  if (!s) return [];
  return normalizeArabic(s).split(" ").filter((t) => t.length >= 3);
}

/** true لو في كلمة مشتركة بين البلاغ ورحلة المستخدم. */
export function alertMatchesRoute(
  alert: Pick<Alert, "location" | "line_name" | "description">,
  route: { from_location?: string | null; to_location?: string | null; transport?: string | null; line_name?: string | null } | null
): boolean {
  if (!route) return false;
  const alertTokens = new Set([
    ...tokens(alert.location),
    ...tokens(alert.line_name),
    ...tokens(alert.description),
  ]);
  if (alertTokens.size === 0) return false;
  const routeTokens = [
    ...tokens(route.from_location),
    ...tokens(route.to_location),
    ...tokens(route.transport),
    ...tokens(route.line_name),
  ];
  return routeTokens.some((t) => alertTokens.has(t));
}
