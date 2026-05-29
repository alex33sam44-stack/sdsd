import { dataClient } from "@/marketing/integrations/data/client";
import { fetchAlerts, alertMatchesRoute, type Alert } from "@/marketing/lib/alerts";
import { fetchMySavings, type SavingsStats } from "@/marketing/lib/savings";

export type DailyLine = {
  id?: string;
  from_location: string;
  to_location: string;
  line_name: string | null;
  morning_time: string;
  notifications_enabled: boolean;
  created_at?: string;
  updated_at?: string;
};

export type DailyBrief = {
  line: DailyLine | null;
  matchingAlerts: Alert[];
  nearbyAlerts: Alert[];
  savings: SavingsStats;
  delayMinutes: number;
  alternativeMinutes: number;
  headline: string;
  questionText: string;
};

const LOCAL_KEY = "mwasalat.dailyLine";

function normalizeLine(row: any): DailyLine | null {
  if (!row) return null;
  return {
    id: row.id,
    from_location: row.from_location ?? "",
    to_location: row.to_location ?? "",
    line_name: row.line_name ?? null,
    morning_time: row.morning_time ?? "08:00",
    notifications_enabled: row.notifications_enabled ?? true,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function getLocalDailyLine(): DailyLine | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as DailyLine) : null;
  } catch {
    return null;
  }
}

export function setLocalDailyLine(line: DailyLine | null) {
  if (!line) localStorage.removeItem(LOCAL_KEY);
  else localStorage.setItem(LOCAL_KEY, JSON.stringify(line));
}

export async function fetchMyDailyLine(): Promise<DailyLine | null> {
  const { data: u } = await dataClient.auth.getUser();
  if (!u.user) return getLocalDailyLine();
  const { data, error } = await (dataClient as any)
    .from("daily_lines")
    .select("*")
    .eq("user_id", u.user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return getLocalDailyLine();
  const line = normalizeLine(data);
  if (line) setLocalDailyLine(line);
  return line ?? getLocalDailyLine();
}

export async function saveMyDailyLine(input: Omit<DailyLine, "id" | "created_at" | "updated_at">): Promise<DailyLine> {
  const clean: DailyLine = {
    from_location: input.from_location.trim(),
    to_location: input.to_location.trim(),
    line_name: input.line_name?.trim() || null,
    morning_time: input.morning_time || "08:00",
    notifications_enabled: input.notifications_enabled,
  };
  setLocalDailyLine(clean);
  const { data: u } = await dataClient.auth.getUser();
  if (!u.user) return clean;

  const existing = await fetchMyDailyLine();
  const payload = { ...clean, user_id: u.user.id };
  const query = existing?.id
    ? (dataClient as any).from("daily_lines").update(payload).eq("id", existing.id).select("*").single()
    : (dataClient as any).from("daily_lines").insert(payload).select("*").single();
  const { data, error } = await query;
  if (error) return clean;
  const saved = normalizeLine(data) ?? clean;
  setLocalDailyLine(saved);
  return saved;
}

export async function fetchDailyBrief(): Promise<DailyBrief> {
  const [line, alerts, savings] = await Promise.all([
    fetchMyDailyLine(),
    fetchAlerts().catch(() => [] as Alert[]),
    fetchMySavings().catch(() => ({ tripsCount: 0, moneySavedEGP: 0, co2SavedKg: 0, alertsReported: 0, peopleHelped: 0 })),
  ]);

  const routeShape = line
    ? { from_location: line.from_location, to_location: line.to_location, transport: line.line_name, line_name: line.line_name }
    : null;
  const matchingAlerts = line ? alerts.filter((a) => alertMatchesRoute(a, routeShape)) : [];
  const nearbyAlerts = line
    ? alerts
        .filter((a) => !matchingAlerts.some((m) => m.id === a.id))
        .filter((a) => {
          const haystack = `${a.location ?? ""} ${a.line_name ?? ""} ${a.description ?? ""}`;
          return [line.from_location, line.to_location, line.line_name ?? ""].some((p) => p && haystack.includes(p));
        })
        .slice(0, 5)
    : alerts.slice(0, 5);

  const pressure = matchingAlerts.length + Math.min(nearbyAlerts.length, 2);
  const delayMinutes = pressure > 0 ? 8 + pressure * 4 : 0;
  const alternativeMinutes = delayMinutes > 0 ? Math.max(6, delayMinutes - 3) : 0;
  const headline = !line
    ? "اختار خطك اليومي وخلي مواصلات يصحّيك على الطريق"
    : delayMinutes > 0
      ? `طريقك المعتاد عليه تأخير. البديل أسرع ${alternativeMinutes} دقيقة.`
      : "طريقك اليومي شكله سالك دلوقتي.";
  const questionText = line
    ? `حد رايح ${line.to_location}؟ الطريق من ${line.from_location} واقف ولا سالك؟`
    : "حد يعرف الطريق واقف ولا سالك؟";

  return { line, matchingAlerts, nearbyAlerts, savings, delayMinutes, alternativeMinutes, headline, questionText };
}

export function buildDailyWhatsAppText(brief: DailyBrief): string {
  if (!brief.line) return "أنا بظبط خطي اليومي على مواصلات عشان أعرف الزحمة والبديل قبل ما أنزل.";
  const url = typeof window === "undefined" ? "/daily" : `${window.location.origin}/daily`;
  const alertLine = brief.matchingAlerts.length > 0
    ? `في ${brief.matchingAlerts.length} بلاغ على الطريق دلوقتي.`
    : "الطريق شكله سالك دلوقتي.";
  return `أنا رايح من ${brief.line.from_location} لـ ${brief.line.to_location}.\n${alertLine}\nمواصلات بتابعلي خطي اليومي والزحمة والتكلفة.\nشوف طريقك هنا:\n${url}`;
}

export function maybeNotifyDailyBrief(brief: DailyBrief) {
  if (!brief.line?.notifications_enabled || typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (brief.delayMinutes <= 0) return;
  const key = `mwasalat.dailyNotified.${new Date().toISOString().slice(0, 10)}.${brief.line.from_location}.${brief.line.to_location}`;
  if (localStorage.getItem(key)) return;
  new Notification("مواصلات: تنبيه خطك اليومي", {
    body: brief.headline,
    icon: "/icons/icon-192.png",
  });
  localStorage.setItem(key, "1");
}
