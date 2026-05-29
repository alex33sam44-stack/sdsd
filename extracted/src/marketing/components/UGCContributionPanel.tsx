import { useState } from "react";
import { CheckCircle2, MessageCircle, PenLine, Share2, Sparkles, TrafficCone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  UGC_ACTIONS,
  submitUGCContribution,
  ugcWhatsappUrl,
  type UGCActionId,
  type UGCContext,
} from "@/marketing/lib/ugc";
import { trackGrowthEvent } from "@/marketing/lib/growth";

type ImpactState = {
  actionId: UGCActionId;
  label: string;
  points: number;
  helpedCount: number;
};

export function UGCContributionPanel({
  context = {},
  compact = false,
  title = "ساعد الناس على نفس الطريق",
}: {
  context?: UGCContext;
  compact?: boolean;
  title?: string;
}) {
  const [impact, setImpact] = useState<ImpactState | null>(null);
  const [pending, setPending] = useState<UGCActionId | null>(null);

  const handleContribution = async (actionId: UGCActionId) => {
    setPending(actionId);
    try {
      const result = await submitUGCContribution(actionId, context);
      setImpact({
        actionId,
        label: result.action.label,
        points: result.action.reward,
        helpedCount: result.helpedCount,
      });
    } finally {
      setPending(null);
    }
  };

  const shareImpact = () => {
    if (!impact) return;
    void trackGrowthEvent("ugc_achievement_shared", {
      ugc_type: impact.actionId,
      helped_count: impact.helpedCount,
      channel: "whatsapp",
      ...context,
    });
  };

  return (
    <section className={`rounded-3xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm ${compact ? "space-y-3" : "space-y-4"}`} dir="rtl">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border-2 border-secondary bg-primary text-secondary">
          <PenLine className="h-5 w-5" strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-lg font-black text-secondary">{title}</p>
          <p className="mt-1 text-xs font-bold leading-relaxed text-muted-foreground">
            UGC حقيقي: بلّغ، صوّت، صحّح، اقترح، أو شارك تجربة. كل مساهمة تتحول لإنجاز قابل للمشاركة.
          </p>
        </div>
      </div>

      <div className={`grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3"}`}>
        {UGC_ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={pending === action.id}
            onClick={() => void handleContribution(action.id)}
            className="rounded-2xl border-2 border-secondary bg-white p-3 text-start shadow-tactile-sm transition active:translate-y-0.5 active:shadow-none disabled:opacity-60"
          >
            <span className="inline-flex items-center gap-1 text-xs font-black text-secondary">
              {action.id === "report_traffic" ? <TrafficCone className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
              {action.shortLabel}
            </span>
            <span className="mt-1 block text-sm font-black leading-tight text-secondary">{action.label}</span>
            <span className="mt-1 block text-[11px] font-bold text-muted-foreground">+{action.reward} نقطة</span>
          </button>
        ))}
      </div>

      {impact && (
        <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 text-emerald-950">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" strokeWidth={2.5} />
            <div className="flex-1">
              <p className="font-black">شكراً! ساعدت {impact.helpedCount.toLocaleString("ar-EG")} شخص على نفس الطريق.</p>
              <p className="mt-1 text-xs font-bold leading-relaxed text-emerald-900">
                مساهمتك: {impact.label} • كسبت {impact.points.toLocaleString("ar-EG")} نقطة. شارك إنجازك وخلي ناس أكتر تدخل تساعد.
              </p>
              <a
                href={ugcWhatsappUrl(impact.actionId, impact.helpedCount, context)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={shareImpact}
                className="mt-3 inline-flex"
              >
                <Button className="gap-2 bg-emerald-500 text-white hover:bg-emerald-600">
                  <MessageCircle className="h-4 w-4" /> شارك إنجازك
                </Button>
              </a>
              <Button
                type="button"
                variant="ghost"
                className="mt-3 gap-2 text-emerald-900"
                onClick={() => {
                  void navigator.clipboard?.writeText(
                    `شكراً! ساعدت ${impact.helpedCount.toLocaleString("ar-EG")} شخص على نفس الطريق باستخدام مواصلات.`,
                  );
                }}
              >
                <Share2 className="h-4 w-4" /> انسخ الكارت
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
