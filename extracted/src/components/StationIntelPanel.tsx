// Operator overlay: surfaces station-level intelligence above the existing
// SVG layout. Pure read — never mutates lines or zones. Designed as a
// collapsible card so it can sit on top of any station page without
// changing the layout component.

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle, Brain, ChevronDown, ChevronUp, Gauge, Layers, ListTree, Sparkles,
} from "lucide-react";
import {
  computeStationIntel, type IntelLine, type IntelZone, type BayMetrics, type BayStatus,
} from "@/modules/shared/services/stationIntel";

const STATUS_TONE: Record<BayStatus, string> = {
  crowded:    "bg-destructive text-destructive-foreground border-destructive",
  active:     "bg-primary text-secondary border-secondary",
  idle:       "bg-warning/40 text-secondary border-secondary",
  inactive:   "bg-surface-alt text-secondary border-secondary",
  unassigned: "bg-muted text-muted-foreground border-secondary",
};

const STATUS_KEY: Record<BayStatus, string> = {
  crowded:    "stationIntel.bayStatus.crowded",
  active:     "stationIntel.bayStatus.active",
  idle:       "stationIntel.bayStatus.idle",
  inactive:   "stationIntel.bayStatus.inactive",
  unassigned: "stationIntel.bayStatus.unassigned",
};

export function StationIntelPanel({
  lines,
  zones,
  defaultOpen = true,
}: {
  lines: IntelLine[];
  zones: IntelZone[];
  defaultOpen?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);

  const intel = useMemo(() => computeStationIntel(lines, zones), [lines, zones]);

  return (
    <section className="rounded-2xl border-2 border-secondary bg-surface shadow-tactile-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 p-4 bg-secondary text-secondary-foreground"
        aria-expanded={open}
      >
        <Brain className="w-4 h-4 text-primary" strokeWidth={2.5} />
        <span className="font-black text-sm flex-1 text-start">
          {t("stationIntel.title", "ذكاء الموقف")}
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {open && (
        <div className="p-4 space-y-4">
          {/* Top stats */}
          <div className="grid grid-cols-2 gap-2">
            <Gauge2
              icon={<Gauge className="w-4 h-4" />}
              label={t("stationIntel.congestion", "ازدحام الموقف")}
              valueLabel={t(`stationIntel.level.${intel.congestionLevel}`, intel.congestionLevel)}
              score={intel.congestionScore}
              tone={
                intel.congestionLevel === "saturated" ? "bg-destructive" :
                intel.congestionLevel === "busy" ? "bg-warning" : "bg-primary"
              }
            />
            <Gauge2
              icon={<Layers className="w-4 h-4" />}
              label={t("stationIntel.complexity", "تعقيد الموقف")}
              valueLabel={t(`stationIntel.complexityLevel.${intel.complexityLevel}`, intel.complexityLevel)}
              score={intel.complexityScore}
              tone="bg-secondary"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <MiniStat label={t("stationIntel.activeBays", "أرصفة عاملة")} value={intel.totals.activeBays} />
            <MiniStat label={t("stationIntel.totalCars", "إجمالي العربيات")} value={intel.totals.totalCars} />
            <MiniStat label={t("stationIntel.staleLines", "خطوط بدون تحديث")} value={intel.totals.staleLines} />
          </div>

          {/* Bay list */}
          <div>
            <h3 className="font-black text-secondary text-sm mb-2 flex items-center gap-1">
              <ListTree className="w-4 h-4" />
              {t("stationIntel.bays", "حالة الأرصفة")}
            </h3>
            <ul className="space-y-2">
              {intel.bays.map((b) => (
                <BayRow key={b.bayKey} bay={b} />
              ))}
              {intel.bays.length === 0 && (
                <li className="text-xs font-bold text-muted-foreground p-3 rounded-lg border-2 border-dashed border-secondary/40 text-center">
                  {t("stationIntel.noBays", "لا توجد أرصفة بعد")}
                </li>
              )}
            </ul>
          </div>

          {/* Reassignment hints */}
          {intel.reassignmentHints.length > 0 && (
            <div>
              <h3 className="font-black text-secondary text-sm mb-2 flex items-center gap-1">
                <Sparkles className="w-4 h-4" />
                {t("stationIntel.hints", "اقتراحات إعادة التوزيع")}
              </h3>
              <ul className="space-y-2">
                {intel.reassignmentHints.map((h, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 rounded-xl border-2 border-warning/60 bg-warning/15 p-3"
                  >
                    <AlertTriangle className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
                    <p className="text-xs font-bold text-secondary leading-snug">
                      {h.reasonKey === "bay.reassign.idleAdjacent"
                        ? t("stationIntel.hint.idleAdjacent", "الرصيف {{from}} مزدحم، والرصيف {{to}} هادئ — فكّر في إعادة التوزيع.", { from: h.fromBayKey, to: h.toBayKey })
                        : t("stationIntel.hint.zeroCars", "الرصيف {{from}} نشط لكن بدون عربيات متاحة الآن.", { from: h.fromBayKey })}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] font-bold text-muted-foreground">
                {t("stationIntel.hintsNote", "اقتراحات أولية — تأكيد العملية يبقى يدوياً.")}
              </p>
            </div>
          )}

          <p className="text-[10px] font-bold text-muted-foreground text-center">
            {t("stationIntel.disclaimer", "تقديرات تشغيلية — لا تعدّل التخطيط الحالي.")}
          </p>
        </div>
      )}
    </section>
  );
}

// ---- subcomponents ----

function Gauge2({
  icon, label, valueLabel, score, tone,
}: { icon: React.ReactNode; label: string; valueLabel: string; score: number; tone: string }) {
  return (
    <div className="rounded-xl border-2 border-secondary bg-surface p-3">
      <div className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
        {icon}{label}
      </div>
      <div className="font-black text-secondary text-base mt-1">{valueLabel}</div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full border border-secondary bg-muted">
        <div className={`h-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </div>
      <div className="mt-1 text-[10px] font-bold text-muted-foreground tabular-nums text-end">
        {score}/100
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border-2 border-secondary bg-surface p-2 text-center">
      <div className="text-[10px] font-bold text-muted-foreground">{label}</div>
      <div className="font-black text-secondary text-lg tabular-nums">{value}</div>
    </div>
  );
}

function BayRow({ bay }: { bay: BayMetrics }) {
  const { t } = useTranslation();
  return (
    <li className="flex items-center gap-3 rounded-xl border-2 border-secondary bg-surface p-3">
      <span className="flex-1 min-w-0">
        <span className="block font-black text-secondary truncate">
          {bay.label}
          <span className="ms-1 text-[10px] font-bold text-muted-foreground">({bay.bayKey})</span>
        </span>
        <span className="block text-[11px] font-bold text-muted-foreground">
          {t("stationIntel.linesN", { n: bay.linesCount, defaultValue: "{{n}} خط" })}
          {" · "}
          {t("stationIntel.carsN", { n: bay.totalCars, defaultValue: "{{n}} عربية" })}
          {bay.loadPct > 0 && ` · ${bay.loadPct}%`}
        </span>
      </span>
      <span className={`text-[10px] font-black px-2 py-1 rounded border-2 ${STATUS_TONE[bay.status]}`}>
        {t(STATUS_KEY[bay.status], bay.status)}
      </span>
    </li>
  );
}
