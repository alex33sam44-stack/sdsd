import { dataClient } from "@/marketing/integrations/data/client";

export const GROWTH_EVENT_NAMES = [
  "invite_sent",
  "invite_opened",
  "signup_from_invite",
  "first_trip_created",
  "share_trip_created",
  "route_share_created",
  "shared_route_opened",
  "guest_route_created",
  "guest_route_shared",
  "report_created",
  "question_answered",
  "ugc_contribution_created",
  "ugc_achievement_shared",
  "trust_feedback_created",
  "app_install_prompt_shown",
  "app_install_prompt_clicked",
  "app_install_prompt_dismissed",
  "app_installed",
] as const;

export type GrowthEventName = typeof GROWTH_EVENT_NAMES[number];

const ANON_KEY = "mwasalat_growth_anon_id";
const OPENED_REF_KEY = "mwasalat_growth_opened_refs";

function getAnonymousId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const existing = localStorage.getItem(ANON_KEY);
    if (existing) return existing;
    const id = crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(ANON_KEY, id);
    return id;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function getCurrentRefCode(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("ref") || localStorage.getItem("pending_ref_code");
}

export async function trackGrowthEvent(
  eventName: GrowthEventName,
  properties: Record<string, unknown> = {},
  inviteCode?: string | null,
): Promise<void> {
  try {
    const { data: auth } = await dataClient.auth.getUser();
    const payload = {
      event_name: eventName,
      user_id: auth.user?.id ?? null,
      anonymous_id: getAnonymousId(),
      invite_code: inviteCode ?? getCurrentRefCode(),
      source_url: typeof window === "undefined" ? null : window.location.href,
      referrer_url: typeof document === "undefined" ? null : document.referrer || null,
      properties,
    };

    const { error } = await (dataClient as any).from("growth_events").insert(payload);
    if (!error) return;

    // Anonymous users should still be measurable before login. The SECURITY
    // DEFINER RPC keeps the 30-second wow moment trackable without forcing auth.
    await (dataClient as any).rpc("track_growth_event", {
      _event_name: payload.event_name,
      _user_id: payload.user_id,
      _anonymous_id: payload.anonymous_id,
      _invite_code: payload.invite_code,
      _source_url: payload.source_url,
      _referrer_url: payload.referrer_url,
      _properties: payload.properties,
    });
  } catch (error) {
    console.warn("[growth] failed to track event", eventName, error);
  }
}

export function trackInviteOpenedOnce(inviteCode: string | null | undefined): void {
  if (!inviteCode || typeof window === "undefined") return;
  try {
    const opened = JSON.parse(localStorage.getItem(OPENED_REF_KEY) || "[]") as string[];
    const normalized = inviteCode.toUpperCase();
    if (opened.includes(normalized)) return;
    opened.push(normalized);
    localStorage.setItem(OPENED_REF_KEY, JSON.stringify(opened.slice(-20)));
    void trackGrowthEvent("invite_opened", { channel: "referral_link" }, normalized);
  } catch {
    void trackGrowthEvent("invite_opened", { channel: "referral_link" }, inviteCode.toUpperCase());
  }
}

export type GrowthDashboard = {
  invite_sent: number;
  invite_opened: number;
  signup_from_invite: number;
  first_trip_created: number;
  share_trip_created: number;
  shared_route_opened: number;
  k_factor: number;
  viral_cycle_time_hours: number | null;
  invite_to_signup_rate: number;
  signup_to_first_trip_rate: number;
  open_to_first_trip_rate: number;
};

export async function getGrowthDashboard(days = 7): Promise<GrowthDashboard> {
  const { data, error } = await (dataClient as any).rpc("get_growth_dashboard", { _days: days });
  if (!error && data) {
    const row = Array.isArray(data) ? data[0] : data;
    return normalizeDashboard(row);
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data: events, error: eventsError } = await (dataClient as any)
    .from("growth_events")
    .select("event_name,created_at,anonymous_id,user_id,invite_code")
    .gte("created_at", since);
  if (eventsError) throw eventsError;
  return computeDashboard(events ?? []);
}

function normalizeDashboard(row: any): GrowthDashboard {
  const inviteSent = Number(row?.invite_sent ?? 0);
  const signupFromInvite = Number(row?.signup_from_invite ?? 0);
  return {
    invite_sent: inviteSent,
    invite_opened: Number(row?.invite_opened ?? 0),
    signup_from_invite: signupFromInvite,
    first_trip_created: Number(row?.first_trip_created ?? 0),
    share_trip_created: Number(row?.share_trip_created ?? 0),
    shared_route_opened: Number(row?.shared_route_opened ?? 0),
    k_factor: Number(row?.k_factor ?? (inviteSent > 0 ? signupFromInvite / inviteSent : 0)),
    viral_cycle_time_hours: row?.viral_cycle_time_hours == null ? null : Number(row.viral_cycle_time_hours),
    invite_to_signup_rate: Number(row?.invite_to_signup_rate ?? 0),
    signup_to_first_trip_rate: Number(row?.signup_to_first_trip_rate ?? 0),
    open_to_first_trip_rate: Number(row?.open_to_first_trip_rate ?? 0),
  };
}

function computeDashboard(events: any[]): GrowthDashboard {
  const count = (name: GrowthEventName) => events.filter((e) => e.event_name === name).length;
  const inviteSent = count("invite_sent");
  const inviteOpened = count("invite_opened");
  const signupFromInvite = count("signup_from_invite");
  const firstTripCreated = count("first_trip_created");
  const shareTripCreated = count("share_trip_created");
  const sharedRouteOpened = count("shared_route_opened");
  return {
    invite_sent: inviteSent,
    invite_opened: inviteOpened,
    signup_from_invite: signupFromInvite,
    first_trip_created: firstTripCreated,
    share_trip_created: shareTripCreated,
    shared_route_opened: sharedRouteOpened,
    k_factor: inviteSent > 0 ? round(signupFromInvite / inviteSent) : 0,
    viral_cycle_time_hours: null,
    invite_to_signup_rate: inviteSent > 0 ? round((signupFromInvite / inviteSent) * 100) : 0,
    signup_to_first_trip_rate: signupFromInvite > 0 ? round((firstTripCreated / signupFromInvite) * 100) : 0,
    open_to_first_trip_rate: inviteOpened > 0 ? round((firstTripCreated / inviteOpened) * 100) : 0,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
