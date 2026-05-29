import { dataClient } from "@/marketing/integrations/data/client";

export type SavingsStats = {
  tripsCount: number;
  moneySavedEGP: number;
  co2SavedKg: number;
  alertsReported: number;
  peopleHelped: number;
};

// Assumptions (transparent, free-tier safe)
const TAXI_AVG_PER_TRIP = 35; // ج.م
const TRANSIT_AVG_PER_TRIP = 8; // ج.م
const CO2_KG_PER_TRIP = 1.8; // kg CO2 vs taxi
const HELPED_PER_ALERT = 12; // approximate people who saw/used alert

export async function fetchMySavings(): Promise<SavingsStats> {
  const { data: u } = await dataClient.auth.getUser();
  if (!u.user) {
    return { tripsCount: 0, moneySavedEGP: 0, co2SavedKg: 0, alertsReported: 0, peopleHelped: 0 };
  }
  const uid = u.user.id;

  const [tripsRes, alertsRes] = await Promise.all([
    dataClient.from("trips").select("id", { count: "exact", head: true }).eq("user_id", uid),
    dataClient.from("alerts").select("id", { count: "exact", head: true }).eq("user_id", uid),
  ]);

  const tripsCount = tripsRes.count ?? 0;
  const alertsReported = alertsRes.count ?? 0;

  return {
    tripsCount,
    moneySavedEGP: tripsCount * (TAXI_AVG_PER_TRIP - TRANSIT_AVG_PER_TRIP),
    co2SavedKg: +(tripsCount * CO2_KG_PER_TRIP).toFixed(1),
    alertsReported,
    peopleHelped: alertsReported * HELPED_PER_ALERT,
  };
}

export function buildShareText(s: SavingsStats, refLink: string): string {
  return (
    `وفّرت ${s.moneySavedEGP} ج.م 💸 و قللت ${s.co2SavedKg} كجم CO₂ 🌱 باستخدامي مواصلات!\n` +
    `${s.tripsCount} رحلة • ${s.alertsReported} بلاغ ساعد ${s.peopleHelped} شخص 🚌\n\n` +
    `جرّبها مجاناً: ${refLink}`
  );
}
