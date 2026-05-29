import { trackGrowthEvent } from "@/marketing/lib/growth";
import { dataClient } from "@/marketing/integrations/data/client";

export const UGC_ACTIONS = [
  {
    id: "report_traffic",
    label: "بلّغ عن زحمة",
    shortLabel: "زحمة",
    reward: 12,
    impactBase: 23,
    shareLine: "بلّغت عن زحمة وساعدت الناس تختار بديل أسرع.",
  },
  {
    id: "vote_route_correct",
    label: "صوّت هل الطريق صحيح؟",
    shortLabel: "تصويت",
    reward: 6,
    impactBase: 17,
    shareLine: "أكدت إن الطريق ده صحيح وساعدت ركاب نفس الخط.",
  },
  {
    id: "suggest_alternative",
    label: "اقترح بديل",
    shortLabel: "بديل",
    reward: 15,
    impactBase: 31,
    shareLine: "اقترحت بديل أسرع للناس على نفس الطريق.",
  },
  {
    id: "correct_fare",
    label: "صحّح سعر",
    shortLabel: "سعر",
    reward: 10,
    impactBase: 19,
    shareLine: "صححت السعر علشان الناس تنزل وهي عارفة هتدفع كام.",
  },
  {
    id: "add_stop",
    label: "أضف موقف",
    shortLabel: "موقف",
    reward: 18,
    impactBase: 36,
    shareLine: "أضفت موقف مهم على الطريق وساعدت الناس توصل أسهل.",
  },
  {
    id: "share_trip_story",
    label: "شارك تجربة مشوار",
    shortLabel: "تجربة",
    reward: 14,
    impactBase: 27,
    shareLine: "شاركت تجربة مشوار حقيقية علشان غيري ينزل مطمّن.",
  },
] as const;

export type UGCActionId = typeof UGC_ACTIONS[number]["id"];

export type UGCContext = {
  routeName?: string;
  areaName?: string;
  from?: string;
  to?: string;
  stationId?: string;
  lineId?: string;
};

export function getUGCAction(id: UGCActionId) {
  return UGC_ACTIONS.find((action) => action.id === id) ?? UGC_ACTIONS[0];
}

export function estimateUGCImpact(actionId: UGCActionId, context: UGCContext = {}) {
  const action = getUGCAction(actionId);
  const seed = `${context.routeName ?? ""}${context.areaName ?? ""}${context.from ?? ""}${context.to ?? ""}${action.id}`;
  const variance = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 11;
  return action.impactBase + variance;
}

export async function submitUGCContribution(actionId: UGCActionId, context: UGCContext = {}) {
  const action = getUGCAction(actionId);
  const helpedCount = estimateUGCImpact(actionId, context);
  const { data: auth } = await dataClient.auth.getUser();
  const payload = {
    user_id: auth.user?.id ?? null,
    contribution_type: action.id,
    route_name: context.routeName ?? null,
    area_name: context.areaName ?? null,
    from_label: context.from ?? null,
    to_label: context.to ?? null,
    station_id: context.stationId ?? null,
    line_id: context.lineId ?? null,
    helped_count: helpedCount,
    points_awarded: action.reward,
    status: "approved",
  };

  try {
    await (dataClient as any).from("ugc_contributions").insert(payload);
  } catch (error) {
    console.warn("[ugc] contribution insert failed", error);
  }

  await trackGrowthEvent("ugc_contribution_created", {
    ugc_type: action.id,
    ugc_label: action.label,
    points_awarded: action.reward,
    helped_count: helpedCount,
    ...context,
  });
  return { action, helpedCount };
}

export function ugcAchievementText(actionId: UGCActionId, helpedCount: number, context: UGCContext = {}) {
  const action = getUGCAction(actionId);
  const route = context.routeName || [context.from, context.to].filter(Boolean).join(" → ") || context.areaName || "نفس الطريق";
  return [
    action.shareLine,
    `شكراً! ساعدت ${helpedCount.toLocaleString("ar-EG")} شخص على ${route}.`,
    "جرب مواصلات وساعد أهل خطك:",
    typeof window === "undefined" ? "https://mwasalat.app" : window.location.href,
  ].join("\n");
}

export function ugcWhatsappUrl(actionId: UGCActionId, helpedCount: number, context: UGCContext = {}) {
  return `https://wa.me/?text=${encodeURIComponent(ugcAchievementText(actionId, helpedCount, context))}`;
}
