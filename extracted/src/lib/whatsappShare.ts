import type { PlanResult } from "@/lib/planner";

const APP_ORIGIN =
  typeof window !== "undefined" && window.location?.origin
    ? window.location.origin
    : "https://mwasalat.app";

export function routeShareUrl(result: PlanResult): string {
  const url = new URL(`/route/${result.station.id}/${result.line.id}`, APP_ORIGIN);
  url.searchParams.set("from", result.pickupStop.name);
  url.searchParams.set("to", result.dropoffStop.name);
  url.searchParams.set("station", result.station.name);
  url.searchParams.set("line", result.line.destination);
  url.searchParams.set("src", "whatsapp");
  return url.toString();
}

export function routeShareText(result: PlanResult): string {
  const vehicle = result.line.vehicleType ?? "مواصلات";
  return [
    `أنا رايح من ${result.pickupStop.name} لـ ${result.dropoffStop.name}.`,
    `مواصلات حسبتلي الطريق والتكلفة والزحمة.`,
    `اركب ${vehicle} من ${result.station.name} ناحية ${result.line.destination}.`,
    `ابعت الجروب يشوفوا الطريق:`,
    routeShareUrl(result),
  ].join("\n");
}

export function routeWhatsAppUrl(result: PlanResult): string {
  return `https://wa.me/?text=${encodeURIComponent(routeShareText(result))}`;
}

export function trafficShareText(lineName: string, location: string, shareUrl: string): string {
  return [
    `في زحمة على خط ${lineName} دلوقتي.`,
    `خصوصًا عند ${location}.`,
    `لو نازل نفس الطريق شوف البديل:`,
    shareUrl,
  ].join("\n");
}

export function trafficWhatsAppUrl(lineName: string, location: string, shareUrl: string): string {
  return `https://wa.me/?text=${encodeURIComponent(trafficShareText(lineName, location, shareUrl))}`;
}
