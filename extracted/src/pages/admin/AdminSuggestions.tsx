import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { TopBar } from "@/components/TopBar";
import { loadSuggestions } from "@/modules/shared/services/suggestions";
import type {
  Suggestion,
  SuggestionSeverity,
} from "@/modules/shared/services/suggestionsEngine";
import {
  AlertOctagon, AlertTriangle, ChevronLeft, Info, Lightbulb,
  Loader2, RefreshCw, Sparkles,
} from "lucide-react";

const SEV_ORDER: SuggestionSeverity[] = ["high", "medium", "low"];

export default function AdminSuggestions() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";
  const Chevron = isRtl ? ChevronLeft : ChevronLeft; // visual only, both ok in RTL flex
  const [filter, setFilter] = useState<SuggestionSeverity | "all">("all");

  const q = useQuery({
    queryKey: ["admin:suggestions"],
    queryFn: loadSuggestions,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const groups = useMemo(() => {
    const all = q.data?.suggestions ?? [];
    const visible = filter === "all" ? all : all.filter((s) => s.severity === filter);
    const by: Record<SuggestionSeverity, Suggestion[]> = { high: [], medium: [], low: [] };
    for (const s of visible) by[s.severity].push(s);
    return by;
  }, [q.data, filter]);

  const counts = useMemo(() => {
    const by: Record<SuggestionSeverity, number> = { high: 0, medium: 0, low: 0 };
    for (const s of q.data?.suggestions ?? []) by[s.severity] += 1;
    return by;
  }, [q.data]);

  return (
    <div className="min-h-screen bg-background">
      <TopBar title={t("adminSuggestions.title", "اقتراحات المشغّل")} backTo="/admin" />
      <div className="px-5 pt-4 pb-10 space-y-4">
        <div className="card-tactile bg-secondary text-secondary-foreground">
          <p className="font-black text-primary text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            {t("adminSuggestions.headline", "اقتراحات تلقائية مبنية على بيانات حقيقية")}
          </p>
          <p className="text-xs font-semibold mt-1 text-secondary-foreground/90">
            {t(
              "adminSuggestions.intro",
              "تكمّل مركز التحقق — تركّز هنا على إشارات تشغيلية متغيّرة (التحديث، الطلب، الربط).",
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <FilterChip current={filter} value="all" onClick={setFilter}
            label={`${t("adminSuggestions.all", "الكل")} (${counts.high + counts.medium + counts.low})`} />
          <FilterChip current={filter} value="high" onClick={setFilter}
            tone="danger" label={`${t("adminSuggestions.high", "عالية")} (${counts.high})`} />
          <FilterChip current={filter} value="medium" onClick={setFilter}
            tone="warn" label={`${t("adminSuggestions.medium", "متوسطة")} (${counts.medium})`} />
          <FilterChip current={filter} value="low" onClick={setFilter}
            label={`${t("adminSuggestions.low", "منخفضة")} (${counts.low})`} />
          <button
            onClick={() => q.refetch()}
            className="ms-auto text-xs font-bold inline-flex items-center gap-1 text-secondary"
            aria-label={t("adminSuggestions.refresh", "تحديث")}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${q.isFetching ? "animate-spin" : ""}`} />
            {t("adminSuggestions.refresh", "تحديث")}
          </button>
        </div>

        {q.isLoading && (
          <div className="card-tactile flex items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-secondary" />
            <span className="font-bold text-secondary">{t("common.loading")}</span>
          </div>
        )}

        {q.isError && (
          <div className="card-tactile">
            <p className="font-black text-destructive">
              {t("adminSuggestions.loadError", "تعذر تحميل الاقتراحات")}
            </p>
            <button onClick={() => q.refetch()} className="btn-primary mt-2">
              {t("adminSuggestions.retry", "إعادة المحاولة")}
            </button>
          </div>
        )}

        {!q.isLoading && !q.isError && (counts.high + counts.medium + counts.low) === 0 && (
          <div className="card-tactile text-center py-8">
            <p className="font-black text-secondary">
              {t("adminSuggestions.allClear", "لا توجد اقتراحات الآن — كل شيء يعمل جيداً")}
            </p>
          </div>
        )}

        {SEV_ORDER.filter((s) => filter === "all" || filter === s).map((sev) => (
          <SeverityGroup
            key={sev}
            severity={sev}
            items={groups[sev]}
            t={t}
            ChevronIcon={Chevron}
          />
        ))}
      </div>
    </div>
  );
}

function FilterChip({
  value, current, onClick, label, tone,
}: {
  value: SuggestionSeverity | "all";
  current: SuggestionSeverity | "all";
  onClick: (v: SuggestionSeverity | "all") => void;
  label: string;
  tone?: "danger" | "warn";
}) {
  const active = current === value;
  const base = "px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-colors";
  const activeCls =
    tone === "danger"
      ? "bg-destructive text-destructive-foreground border-destructive"
      : tone === "warn"
        ? "bg-amber-400 text-secondary border-amber-500"
        : "bg-secondary text-secondary-foreground border-secondary";
  const idleCls = "bg-surface text-secondary border-secondary/30";
  return (
    <button onClick={() => onClick(value)} className={`${base} ${active ? activeCls : idleCls}`}>
      {label}
    </button>
  );
}

function SeverityGroup({
  severity, items, t, ChevronIcon,
}: {
  severity: SuggestionSeverity;
  items: Suggestion[];
  t: ReturnType<typeof useTranslation>["t"];
  ChevronIcon: React.ComponentType<{ className?: string }>;
}) {
  if (items.length === 0) return null;
  const meta = SEV_META[severity];
  const Icon = meta.icon;
  return (
    <section aria-labelledby={`sev-${severity}`} className="space-y-2">
      <h2 id={`sev-${severity}`} className={`text-sm font-black flex items-center gap-2 ${meta.text}`}>
        <Icon className="w-4 h-4" /> {t(meta.titleKey, meta.titleFallback)} · {items.length}
      </h2>
      <ul className="space-y-2">
        {items.map((s) => (
          <li key={s.id} className={`rounded-xl border-2 p-3 ${meta.cardCls}`}>
            <div className="flex items-start gap-2">
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${meta.text}`} />
              <div className="flex-1 min-w-0">
                <p className="font-black text-secondary text-sm">{s.title}</p>
                <p className="text-xs text-muted-foreground font-semibold mt-0.5">{s.detail}</p>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Link
                to={s.actionTo}
                className="text-xs font-bold inline-flex items-center gap-1 rounded-md bg-secondary text-secondary-foreground px-3 py-1.5"
              >
                {s.actionLabel}
                <ChevronIcon className="w-3.5 h-3.5" />
              </Link>
              <span className="text-[10px] text-muted-foreground/80 ms-auto font-mono">
                {s.category}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const SEV_META: Record<SuggestionSeverity, {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  cardCls: string;
  titleKey: string;
  titleFallback: string;
}> = {
  high: {
    icon: AlertOctagon,
    text: "text-destructive",
    cardCls: "border-destructive/40 bg-destructive/5",
    titleKey: "adminSuggestions.high",
    titleFallback: "أولوية عالية",
  },
  medium: {
    icon: AlertTriangle,
    text: "text-amber-700 dark:text-amber-300",
    cardCls: "border-amber-300 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-700/40",
    titleKey: "adminSuggestions.medium",
    titleFallback: "أولوية متوسطة",
  },
  low: {
    icon: Info,
    text: "text-secondary",
    cardCls: "border-secondary/30 bg-surface",
    titleKey: "adminSuggestions.low",
    titleFallback: "أولوية منخفضة",
  },
};
