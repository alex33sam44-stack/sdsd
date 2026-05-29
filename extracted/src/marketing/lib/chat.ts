import { dataClient } from "@/marketing/integrations/data/client";

export type Question = {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  from_location: string | null;
  to_location: string | null;
  points_offered: number;
  best_answer_id: string | null;
  status: "open" | "answered" | "closed";
  created_at: string;
};

export type Answer = {
  id: string;
  question_id: string;
  user_id: string;
  body: string;
  is_best: boolean;
  created_at: string;
};

export type Profile = {
  user_id: string;
  display_name: string | null;
  points: number;
};

export type QuestionFilter = "all" | "open" | "answered";

export async function fetchQuestions(opts?: { search?: string; filter?: QuestionFilter }): Promise<Question[]> {
  let q = dataClient
    .from("questions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (opts?.filter === "open") q = q.eq("status", "open");
  if (opts?.filter === "answered") q = q.in("status", ["answered", "closed"]);
  if (opts?.search && opts.search.trim().length > 0) {
    const s = opts.search.trim().replace(/[%,]/g, " ");
    q = q.or(
      `title.ilike.%${s}%,body.ilike.%${s}%,from_location.ilike.%${s}%,to_location.ilike.%${s}%`,
    );
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Question[];
}

export type LeaderboardEntry = { user_id: string; display_name: string | null; points: number; public_slug?: string | null };
export type LocalLeaderboardEntry = LeaderboardEntry & { activity_count: number; nearest_km: number };

// Lightweight per-tab cache for leaderboards (reduces DB load under spikes)
const LB_TTL_MS = 60_000;
const lbCache = new Map<string, { data: unknown; at: number }>();

export async function fetchLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
  const key = `global:${limit}`;
  const hit = lbCache.get(key);
  if (hit && Date.now() - hit.at < LB_TTL_MS) return hit.data as LeaderboardEntry[];
  const { data, error } = await dataClient
    .from("profiles")
    .select("user_id, display_name, points, public_slug")
    .order("points", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as LeaderboardEntry[];
  lbCache.set(key, { data: rows, at: Date.now() });
  return rows;
}

export async function fetchLocalLeaderboard(
  lat: number, lng: number, radiusKm = 10, limit = 50,
): Promise<LocalLeaderboardEntry[]> {
  // Round coords so nearby users share cache entries
  const key = `local:${lat.toFixed(2)}:${lng.toFixed(2)}:${radiusKm}:${limit}`;
  const hit = lbCache.get(key);
  if (hit && Date.now() - hit.at < LB_TTL_MS) return hit.data as LocalLeaderboardEntry[];
  const { data, error } = await dataClient.rpc("fetch_local_leaderboard", {
    _lat: lat, _lng: lng, _radius_km: radiusKm, _limit: limit,
  });
  if (error) throw error;
  const rows = (data ?? []) as LocalLeaderboardEntry[];
  lbCache.set(key, { data: rows, at: Date.now() });
  return rows;
}


export type Notification = {
  id: string;
  user_id: string;
  type: string;
  question_id: string | null;
  answer_id: string | null;
  message: string;
  read: boolean;
  created_at: string;
};

export async function fetchNotifications(): Promise<Notification[]> {
  const { data, error } = await dataClient
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as Notification[];
}

export async function markAllNotificationsRead() {
  const { data: auth } = await dataClient.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return;
  const { error } = await dataClient
    .from("notifications")
    .update({ read: true })
    .eq("user_id", uid)
    .eq("read", false);
  if (error) throw error;
}

// Badge tier based on points
export function badgeForPoints(points: number): { label: string; className: string } {
  if (points >= 500) return { label: "أسطورة", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" };
  if (points >= 200) return { label: "خبير", className: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30" };
  if (points >= 80) return { label: "متمرس", className: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30" };
  return { label: "مبتدئ", className: "bg-muted text-muted-foreground border-border" };
}

export async function fetchAnswers(questionId: string): Promise<Answer[]> {
  const { data, error } = await dataClient
    .from("answers")
    .select("*")
    .eq("question_id", questionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Answer[];
}

export async function fetchProfilesByIds(userIds: string[]): Promise<Record<string, Profile>> {
  if (userIds.length === 0) return {};
  const { data, error } = await dataClient
    .from("profiles")
    .select("user_id, display_name, points, public_slug")
    .in("user_id", userIds);
  if (error) throw error;
  const map: Record<string, Profile> = {};
  for (const p of data ?? []) map[(p as Profile).user_id] = p as Profile;
  return map;
}

export async function fetchMyProfile(): Promise<Profile | null> {
  const { data: auth } = await dataClient.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return null;
  const { data, error } = await dataClient
    .from("profiles")
    .select("user_id, display_name, points, public_slug")
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw error;
  return (data as Profile) ?? null;
}

export async function askQuestion(input: {
  title: string;
  body?: string;
  from_location?: string;
  to_location?: string;
  points_offered: number;
}) {
  const { data: auth } = await dataClient.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("لازم تسجل دخول الأول");
  const { error } = await dataClient.from("questions").insert({
    user_id: uid,
    title: input.title.trim(),
    body: input.body?.trim() || null,
    from_location: input.from_location?.trim() || null,
    to_location: input.to_location?.trim() || null,
    points_offered: input.points_offered,
  });
  if (error) throw error;
}

export async function postAnswer(questionId: string, body: string) {
  const { data: auth } = await dataClient.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("لازم تسجل دخول الأول");
  const { error } = await dataClient.from("answers").insert({
    question_id: questionId,
    user_id: uid,
    body: body.trim(),
  });
  if (error) throw error;
}

export async function acceptAnswer(answerId: string) {
  const { error } = await dataClient.rpc("accept_answer", { _answer_id: answerId });
  if (error) throw error;
}
