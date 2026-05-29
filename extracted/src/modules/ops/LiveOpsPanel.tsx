import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Activity, AlertTriangle, CarFront, CircleSlash, Clock,
  Layers3, RefreshCw, Search, TrendingUp,
} from "lucide-react";
import {
  loadLiveOps, loadTrendingSearches, deriveMetrics,
  type LiveLine,
} from "@/modules/shared/services/liveOps";
import { useTenantEntitlements } from "@/modules/billing/useEntitlements";

/**
 * Live operations panel — read-only summary on top of the existing admin
 * structure. All edits still happen via the existing CRUD pages; rows here
 * deep-link into those screens for one-tap action.
 */
export function LiveOpsPanel() {
  const { t } = useTranslation();
  const ent = useTenantEntitlements();
  const snapQ = useQuery({
    queryKey: ["ops:live"],
    queryFn: loadLiveOps,
    staleTime: 30_000,
    refetchInterval: 60_000, // gentle polling, no fake realtime
    refetchOnWindowFocus: true,
  });
  const trendQ = useQuery({
    queryKey: ["ops:trending"],
    queryFn: () => loadTrendingSearches(),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  if (ent.currentTenant && !ent.isLoading && !ent.isError && !ent.hasFeature('live_ops')) {
    return (
      <PanelShell>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl border-2 border-secondary bg-primary/10 grid place-items-center text-secondary shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div className="space-y-2">
            <p className="font-black text-secondary">لوحة التشغيل الحية غير متاحة في خطتك الحالية</p>
            <p className="text-xs font-semibold text-muted-foreground">يمكنك الترقية من صفحة الفوترة لتفعيل مؤشرات التشغيل الحية والتنبيهات المباشرة.</p>
            <Link to="/admin/billing" className="btn-primary inline-flex">ترقية الخطة</Link>
          </div>
        </div>
      </PanelShell>
    );
  }

  if (snapQ.isLoading) {
    return <PanelShell><p className="text-sm font-bold text-secondary">{t("common.loading")}</p></PanelShell>;
  }
  if (snapQ.isError || !snapQ.data) {
    return (
      <PanelShell>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-destructive">{t("ops.live.loadError", "تعذر تحميل البيانات الحية")}</p>
          <button onClick={() => snapQ.refetch()} className="text-xs font-bold underline">
            {t("ops.live.retry", "إعادة المحاولة")}
          </button>
        </div>
      </PanelShell>
    );
  }

  const m = deriveMetrics(snapQ.data);
  const fetchedAgo = minutesAgo(snapQ.data.fetchedAt);

  return (
    <section aria-labelledby="ops-live-title" className="space-y-3">
      <header className="flex items-center justify-between">
        <h2 id="ops-live-title" className="font-black text-secondary text-base flex items-center gap-2">
          <Activity className="w-4 h-4" /> {t("ops.live.title", "نظرة حية على العمليات")}
        </h2>
        <button
          onClick={() => { snapQ.refetch(); trendQ.refetch(); }}
          className="text-xs font-bold text-secondary inline-flex items-center gap-1"
          aria-label={t("ops.live.refresh", "تحديث")}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${snapQ.isFetching ? "animate-spin" : ""}`} />
          {fetchedAgo === 0 ? t("ops.live.justNow", "محدّث الآن") : t("ops.live.minAgo", { count: fetchedAgo, defaultValue: "قبل {{count}} دقيقة" })}
        </button>
      </header>

      {/* Summary widgets */}
      <div className="grid grid-cols-2 gap-2">
        <Stat icon={<Layers3 className="w-4 h-4" />} label={t("ops.live.activeLines", "خطوط نشطة")} value={m.activeLines} sub={`/ ${m.totalLines}`} />
        <Stat icon={<CarFront className="w-4 h-4" />} label={t("ops.live.totalCars", "إجمالي العربيات")} value={m.totalCars} />
        <Stat icon={<AlertTriangle className="w-4 h-4" />} label={t("ops.live.needsReview", "تحتاج مراجعة")} value={m.unpublishedLines.length} tone="warn" />
        <Stat icon={<CircleSlash className="w-4 h-4" />} label={t("ops.live.stopped", "خطوط متوقفة")} value={m.stoppedLines} tone="danger" />
      </div>

      {/* Visibility cards */}
      <div className="grid gap-3 md:grid-cols-2">
        <ListCard
          tone="warn"
          icon={<Clock className="w-4 h-4" />}
          title={t("ops.live.staleTitle", "خطوط لم يتم تحديثها مؤخراً")}
          items={m.staleLines}
          empty={t("ops.live.allFresh", "كل البيانات محدثة")}
          rightLabel={(l) => `${minutesAgo(l.cars_updated_at)}m`}
        />
        <ListCard
          tone="danger"
          icon={<CircleSlash className="w-4 h-4" />}
          title={t("ops.live.zeroCarsTitle", "خطوط بدون عربيات متاحة")}
          items={m.zeroCarsLines}
          empty={t("ops.live.noZero", "لا توجد")}
          rightLabel={() => "0"}
        />
        <ListCard
          tone="muted"
          icon={<CircleSlash className="w-4 h-4" />}
          title={t("ops.live.stoppedTitle", "خطوط متوقفة حالياً")}
          items={m.stoppedLinesList}
          empty={t("ops.live.noStopped", "لا توجد")}
          rightLabel={() => t("ops.live.stoppedShort", "متوقف")}
        />
        <TrendingCard
          title={t("ops.live.trending", "الوجهات الأكثر طلباً الآن")}
          items={trendQ.data ?? []}
          empty={t("ops.live.noTrending", "لا توجد بيانات بحث حديثة")}
        />
      </div>
    </section>
  );
}

function PanelShell({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm">{children}</div>;
}

function Stat({
  icon, label, value, sub, tone,
}: { icon: React.ReactNode; label: string; value: number | string; sub?: string; tone?: "warn" | "danger" }) {
  const toneCls =
    tone === "danger" ? "text-destructive" : tone === "warn" ? "text-amber-700 dark:text-amber-300" : "text-secondary";
  return (
    <div className="rounded-xl border-2 border-secondary bg-surface p-3 shadow-tactile-sm">
      <p className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
        <span className={toneCls}>{icon}</span>{label}
      </p>
      <p className={`text-2xl font-black tabular-nums mt-1 ${toneCls}`}>
        {value}
        {sub && <span className="text-xs font-bold text-muted-foreground ms-1">{sub}</span>}
      </p>
    </div>
  );
}

function ListCard({
  icon, title, items, empty, rightLabel, tone = "muted",
}: {
  icon: React.ReactNode;
  title: string;
  items: LiveLine[];
  empty: string;
  rightLabel: (l: LiveLine) => string;
  tone?: "warn" | "danger" | "muted";
}) {
  const toneCls =
    tone === "danger"
      ? "border-destructive/40 bg-destructive/5"
      : tone === "warn"
        ? "border-amber-300 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-700/40"
        : "border-secondary/30 bg-surface";
  return (
    <div className={`rounded-xl border-2 p-3 ${toneCls}`}>
      <p className="font-black text-secondary text-sm flex items-center gap-2 mb-2">
        {icon} {title}
        <span className="ms-auto text-[11px] font-bold text-muted-foreground tabular-nums">{items.length}</span>
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground font-semibold">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((l) => (
            <li key={l.id}>
              <Link
                to={`/admin/line/${l.station_id}/${l.id}`}
                className="flex items-center gap-2 text-sm rounded-md px-2 py-1.5 hover:bg-secondary/5 active:bg-secondary/10"
              >
                <span className="font-bold text-secondary truncate">{l.destination}</span>
                {l.station_name && (
                  <span className="text-[11px] text-muted-foreground truncate">· {l.station_name}</span>
                )}
                <span className="ms-auto text-[11px] font-bold tabular-nums text-muted-foreground">
                  {rightLabel(l)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TrendingCard({
  title, items, empty,
}: { title: string; items: { query: string; count: number }[]; empty: string }) {
  return (
    <div className="rounded-xl border-2 border-secondary/30 bg-surface p-3">
      <p className="font-black text-secondary text-sm flex items-center gap-2 mb-2">
        <TrendingUp className="w-4 h-4" /> {title}
        <span className="ms-auto text-[11px] font-bold text-muted-foreground tabular-nums">{items.length}</span>
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground font-semibold">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.query} className="flex items-center gap-2 text-sm px-2 py-1">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="font-bold text-secondary truncate">{it.query}</span>
              <span className="ms-auto text-[11px] font-bold tabular-nums text-muted-foreground">{it.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function minutesAgo(iso: string): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.round((Date.now() - t) / 60000));
}
