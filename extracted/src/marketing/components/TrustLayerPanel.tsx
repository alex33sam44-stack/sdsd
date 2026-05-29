import { useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Clock3, HelpCircle, ShieldCheck, ThumbsDown, ThumbsUp, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  estimateTrustSignal,
  submitTrustVote,
  trustLevelClasses,
  type TrustContext,
  type TrustVoteType,
} from "@/marketing/lib/trust";

export function TrustLayerPanel({ context = {}, compact = false }: { context?: TrustContext; compact?: boolean }) {
  const signal = useMemo(() => estimateTrustSignal(context), [context.routeName, context.from, context.to, context.stationId, context.lineId, context.areaName]);
  const [selected, setSelected] = useState<TrustVoteType | null>(null);
  const [pending, setPending] = useState<TrustVoteType | null>(null);

  const vote = async (type: TrustVoteType) => {
    setPending(type);
    try {
      await submitTrustVote(type, context);
      setSelected(type);
    } finally {
      setPending(null);
    }
  };

  const chip = (children: ReactNode, className = "") => (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-black ${className}`}>{children}</span>
  );

  return (
    <section className={`rounded-3xl border-2 p-4 shadow-tactile-sm ${trustLevelClasses(signal.level)}`} dir="rtl" aria-label="طبقة الثقة">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border-2 border-current bg-white/70">
          <ShieldCheck className="h-5 w-5" strokeWidth={2.5} />
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-black">المعلومة منين؟</p>
            {chip(signal.label, "bg-white/70")}
          </div>
          <p className="mt-1 text-xs font-bold leading-relaxed opacity-85">
            نعرض وقت آخر تحديث، عدد التأكيدات، وتصويت الناس على السعر والخط حتى تقدر تشارك الطريق بثقة.
          </p>
        </div>
      </div>

      <div className={`mt-3 grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4"}`}>
        <div className="rounded-2xl border bg-white/70 p-3">
          <Clock3 className="mb-1 h-4 w-4" strokeWidth={2.5} />
          <p className="text-[11px] font-black opacity-70">آخر تحديث</p>
          <p className="text-sm font-black">منذ {signal.updatedMinutesAgo.toLocaleString("ar-EG")} دقيقة</p>
        </div>
        <div className="rounded-2xl border bg-white/70 p-3">
          <UsersRound className="mb-1 h-4 w-4" strokeWidth={2.5} />
          <p className="text-[11px] font-black opacity-70">تأكيدات المستخدمين</p>
          <p className="text-sm font-black">{signal.confirmations.toLocaleString("ar-EG")} مستخدم</p>
        </div>
        <div className="rounded-2xl border bg-white/70 p-3">
          <CheckCircle2 className="mb-1 h-4 w-4" strokeWidth={2.5} />
          <p className="text-[11px] font-black opacity-70">تصويت السعر</p>
          <p className="text-sm font-black">{signal.fareVotes.toLocaleString("ar-EG")} تأكيد</p>
        </div>
        <div className="rounded-2xl border bg-white/70 p-3">
          <HelpCircle className="mb-1 h-4 w-4" strokeWidth={2.5} />
          <p className="text-[11px] font-black opacity-70">هل الخط يعمل؟</p>
          <p className="text-sm font-black">{signal.lineWorkingVotes.toLocaleString("ar-EG")} قالوا نعم</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <TrustQuestion
          label="هل السعر صحيح؟"
          yesLabel="نعم"
          noLabel="لا"
          yesType="fare_correct"
          noType="fare_wrong"
          selected={selected}
          pending={pending}
          onVote={vote}
        />
        <TrustQuestion
          label="هل الخط يعمل الآن؟"
          yesLabel="شغال"
          noLabel="واقف"
          yesType="line_working"
          noType="line_not_working"
          selected={selected}
          pending={pending}
          onVote={vote}
        />
        <TrustQuestion
          label="هل الطريق صحيح؟"
          yesLabel="صحيح"
          noLabel="غير دقيق"
          yesType="route_correct"
          noType="route_wrong"
          selected={selected}
          pending={pending}
          onVote={vote}
        />
      </div>

      {selected && (
        <p className="mt-3 rounded-2xl border border-current bg-white/70 px-3 py-2 text-xs font-black">
          تم تسجيل تأكيدك. كده ساعدت الناس اللي هتفتح نفس الطريق بعدك.
        </p>
      )}
    </section>
  );
}

function TrustQuestion({
  label,
  yesLabel,
  noLabel,
  yesType,
  noType,
  selected,
  pending,
  onVote,
}: {
  label: string;
  yesLabel: string;
  noLabel: string;
  yesType: TrustVoteType;
  noType: TrustVoteType;
  selected: TrustVoteType | null;
  pending: TrustVoteType | null;
  onVote: (type: TrustVoteType) => void;
}) {
  const buttonClass = (type: TrustVoteType) => selected === type ? "bg-secondary text-secondary-foreground" : "bg-white/70";
  return (
    <div className="rounded-2xl border bg-white/50 p-3">
      <p className="mb-2 text-xs font-black">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" size="sm" variant="outline" disabled={pending === yesType} onClick={() => onVote(yesType)} className={`gap-1 border-current ${buttonClass(yesType)}`}>
          <ThumbsUp className="h-3.5 w-3.5" /> {yesLabel}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={pending === noType} onClick={() => onVote(noType)} className={`gap-1 border-current ${buttonClass(noType)}`}>
          <ThumbsDown className="h-3.5 w-3.5" /> {noLabel}
        </Button>
      </div>
    </div>
  );
}
