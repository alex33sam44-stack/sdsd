import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { TopBar } from "@/components/TopBar";
import { loadAnalytics, type FreshnessBucket } from "@/modules/shared/services/analytics";
import {
  AlertTriangle, BarChart3, Clock, Loader2, RefreshCw,
  Search, TrendingUp, Bus, MapPin,
} from "lucide-react";

const WINDOWS = [3, 7, 14, 30] as const;

export default function AdminAnalytics() {
  const { t } = useTranslation();
  const [windowDays, setWindowDays] = useState<(typeof WINDOWS)[number]>(14);

  const q = useQuery({
    queryKey: ["admin:analytics", windowDays],
    queryFn: () => loadAnalytics(windowDays),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const data = q.data;
  const peakHour = useMemo(() => {
    if (!data) return null;
    let best = -1, idx = 0;
    data.demandByHour.forEach((b, i) => { if (b.count > best) { best = b.count; idx = i; } });
    return best > 0 ? { hour: idx, count: best } : null;
  }, [data]);

  return (
    <div className="min-h-screen bg-background">
      <TopBar title={t("adminAnalytics.title", "تقارير وتحليلات")} backTo="/admin" />
      <div className="px-5 pt-4 pb-10 space-y-4">
        <div className="card-tactile bg-secondary text-secondary-foreground">
          <p className="font-black text-primary text-sm flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            {t("adminAnalytics.headline", "نظرة تشغيلية على الطلب والجودة")}
          </p>
          <p className="text-xs font-semibold mt-1 text-secondary-foreground/90">
            {t(
              "adminAnalytics.intro",
              "البيانات مبنية على السجلات الحالية فقط — لم نضف أي جداول جديدة.",
            )}
          </p>
        </div>

        {/* window selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {WINDOWS.map((d) => (
            <button
              key={d}
              onClick={() => setWindowDays(d)}
              className={`pill text-xs ${windowDays === d ? "bg-primary text-secondary" : "bg-surface text-secondary border-2 border-secondary"}`}
            >
              {t("adminAnalytics.lastNDays", { n: d, defaultValue: "آخر {{n}} يوم" })}
            </button>
          ))}
          <button
            onClick={() => q.refetch()}
            className="ms-auto text-xs font-bold inline-flex items-center gap-1 text-secondary"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${q.isFetching ? "animate-spin" : ""}`} />
            {t("adminAnalytics.refresh", "تحديث")}
          </button>
        </div>

        {q.isLoading && (
          <div className="flex items-center gap-2 p-6 text-secondary">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("common.loading")}
          </div>
        )}

        {q.isError && (
          <div className="card-tactile bg-destructive text-destructive-foreground">
            <p className="font-black text-sm">{t("adminAnalytics.loadError", "تعذر تحميل التقارير")}</p>
            <button onClick={() => q.refetch()} className="mt-2 pill bg-surface text-secondary">
              {t("adminAnalytics.retry", "إعادة المحاولة")}
            </button>
          </div>
        )}

        {data && (
          <>
            {/* Totals strip */}
            <div className="grid grid-cols-2 gap-2">
              <Stat icon={<Search className="w-4 h-4" />} label={t("adminAnalytics.totalSearches", "إجمالي البحث")} value={data.totals.searches} />
              <Stat icon={<Bus className="w-4 h-4" />} label={t("adminAnalytics.publishedLines", "الخطوط المنشورة")} value={data.totals.publishedLines} />
              <Stat icon={<MapPin className="w-4 h-4" />} label={t("adminAnalytics.publishedStations", "المواقف المنشورة")} value={data.totals.publishedStations} />
              <Stat icon={<AlertTriangle className="w-4 h-4" />} label={t("adminAnalytics.validationIssues", "مشاكل التحقق")} value={data.totals.validationIssues} />
            </div>

            {/* Most requested lines */}
            <Section
              icon={<TrendingUp className="w-4 h-4" />}
              title={t("adminAnalytics.topRequested", "أكثر الخطوط طلباً")}
              empty={data.topRequestedLines.length === 0}
              emptyText={t("adminAnalytics.noSearchData", "لا توجد بيانات بحث في هذه الفترة")}
            >
              <ol className="space-y-2">
                {data.topRequestedLines.map((l, i) => (
                  <li key={l.line_id}>
                    <Link
                      to={`/admin/line/${l.station_id}/${l.line_id}`}
                      className="flex items-center gap-3 rounded-xl border-2 border-secondary bg-surface p-3 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform"
                    >
                      <span className="w-7 h-7 rounded-lg bg-primary text-secondary font-black grid place-items-center text-sm">
                        {i + 1}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-black text-secondary truncate">{l.destination}</span>
                        {l.station_name && <span className="block text-xs font-bold text-muted-foreground truncate">{l.station_name}</span>}
                      </span>
                      <span className="font-black text-secondary tabular-nums">{l.requests}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </Section>

            {/* Unserved queries */}
            <Section
              icon={<Search className="w-4 h-4" />}
              title={t("adminAnalytics.unserved", "بحث بدون نتيجة مباشرة")}
              empty={data.unservedQueries.length === 0}
              emptyText={t("adminAnalytics.noUnserved", "كل عمليات البحث وجدت نتائج 🎉")}
            >
              <ul className="space-y-2">
                {data.unservedQueries.map((u) => (
                  <li
                    key={u.query}
                    className="flex items-center justify-between gap-3 rounded-xl border-2 border-secondary bg-surface p-3 shadow-tactile-sm"
                  >
                    <span className="font-bold text-secondary truncate">{u.query}</span>
                    <span className="text-xs font-black text-secondary bg-warning/20 px-2 py-1 rounded">
                      {t("adminAnalytics.searchesN", { n: u.searches, defaultValue: "{{n}} بحث" })}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>

            {/* Availability */}
            <Section
              icon={<Bus className="w-4 h-4" />}
              title={t("adminAnalytics.availability", "متوسط توفر العربيات (الحالي)")}
              empty={data.lineAvailability.length === 0}
              emptyText={t("adminAnalytics.noLines", "لا توجد خطوط منشورة")}
              hint={t("adminAnalytics.availabilityHint", "نعرض اللقطة الحالية — لا يوجد جدول لقطات تاريخية بعد.")}
            >
              <ul className="space-y-2">
                {data.lineAvailability.map((l) => (
                  <li key={l.line_id}>
                    <Link
                      to={`/admin/line/${l.station_id}/${l.line_id}`}
                      className="flex items-center gap-3 rounded-xl border-2 border-secondary bg-surface p-3 shadow-tactile-sm"
                    >
                      <span className="flex-1 min-w-0">
                        <span className="block font-black text-secondary truncate">{l.destination}</span>
                        {l.station_name && <span className="block text-xs font-bold text-muted-foreground truncate">{l.station_name}</span>}
                      </span>
                      <span className={`text-[10px] font-black px-2 py-1 rounded ${l.status === "stopped" ? "bg-destructive text-destructive-foreground" : l.status === "crowded" ? "bg-warning/30 text-secondary" : "bg-primary/20 text-secondary"}`}>
                        {t(`adminAnalytics.status.${l.status}`, l.status)}
                      </span>
                      <span className="font-black text-secondary tabular-nums">{l.avgCars}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>

            {/* Freshness */}
            <Section
              icon={<Clock className="w-4 h-4" />}
              title={t("adminAnalytics.freshness", "دقة وحداثة التحديثات")}
              empty={data.freshness.totalPublished === 0}
              emptyText={t("adminAnalytics.noLines", "لا توجد خطوط منشورة")}
            >
              <div className="rounded-xl border-2 border-secondary bg-surface p-3 shadow-tactile-sm space-y-3">
                <FreshnessBar buckets={data.freshness.buckets} total={data.freshness.totalPublished} />
                <div className="grid grid-cols-2 gap-2 text-xs font-bold text-secondary">
                  <FreshnessLegend label={t("adminAnalytics.fresh", "محدّث (<15د)")} pct={data.freshness.freshPct} tone="bg-primary" />
                  <FreshnessLegend label={t("adminAnalytics.recent", "حديث (<60د)")} pct={data.freshness.recentPct} tone="bg-primary/60" />
                  <FreshnessLegend label={t("adminAnalytics.stale", "قديم (<3س)")} pct={data.freshness.stalePct} tone="bg-warning" />
                  <FreshnessLegend label={t("adminAnalytics.veryStale", "قديم جدًا (>3س)")} pct={data.freshness.veryStalePct} tone="bg-destructive" />
                </div>
                <p className="text-[11px] font-bold text-muted-foreground">
                  {t("adminAnalytics.medianAge", "متوسط العمر: {{n}} دقيقة", { n: data.freshness.medianAgeMin })}
                </p>
              </div>
            </Section>

            {/* Problem entities */}
            <Section
              icon={<AlertTriangle className="w-4 h-4" />}
              title={t("adminAnalytics.problems", "خطوط ومواقف بأكثر مشاكل")}
              empty={data.problemEntities.length === 0}
              emptyText={t("adminAnalytics.noProblems", "لا توجد مشاكل تحقق حالياً")}
            >
              <ul className="space-y-2">
                {data.problemEntities.map((p) => {
                  const to = p.kind === "line"
                    ? `/admin/line/${p.stationId}/${p.id}`
                    : `/admin/layout/${p.id}`;
                  return (
                    <li key={`${p.kind}-${p.id}`}>
                      <Link to={to} className="flex items-center gap-3 rounded-xl border-2 border-secondary bg-surface p-3 shadow-tactile-sm">
                        <span className="flex-1 min-w-0">
                          <span className="block font-black text-secondary truncate">{p.label}</span>
                          <span className="block text-[11px] font-bold text-muted-foreground">
                            {t(`adminAnalytics.kind.${p.kind}`, p.kind)}
                          </span>
                        </span>
                        {p.errors > 0 && (
                          <span className="text-[10px] font-black px-2 py-1 rounded bg-destructive text-destructive-foreground tabular-nums">
                            {p.errors} {t("adminAnalytics.errors", "خطأ")}
                          </span>
                        )}
                        {p.warnings > 0 && (
                          <span className="text-[10px] font-black px-2 py-1 rounded bg-warning/40 text-secondary tabular-nums">
                            {p.warnings} {t("adminAnalytics.warnings", "تحذير")}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Section>

            {/* Demand */}
            <Section
              icon={<BarChart3 className="w-4 h-4" />}
              title={t("adminAnalytics.demand", "الطلب حسب الوقت")}
              empty={data.totals.searches === 0}
              emptyText={t("adminAnalytics.noSearchData", "لا توجد بيانات بحث في هذه الفترة")}
            >
              <div className="rounded-xl border-2 border-secondary bg-surface p-3 shadow-tactile-sm space-y-3">
                {peakHour && (
                  <p className="text-xs font-bold text-secondary">
                    {t("adminAnalytics.peakHour", "أعلى طلب في الساعة {{h}}:00 ({{n}} بحث)", { h: peakHour.hour, n: peakHour.count })}
                  </p>
                )}
                <HourBars buckets={data.demandByHour} />
                <DayList items={data.demandByDay} label={t("adminAnalytics.demandByDay", "الطلب اليومي")} />
              </div>
            </Section>

            <p className="text-[11px] text-muted-foreground font-bold text-center pt-2">
              {t("adminAnalytics.fetchedAt", "آخر تحديث: {{at}}", { at: new Date(data.fetchedAt).toLocaleString() })}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- subcomponents ---------------------------------------------------

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border-2 border-secondary bg-surface p-3 shadow-tactile-sm">
      <div className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className="font-black text-secondary text-2xl tabular-nums mt-1">{value}</div>
    </div>
  );
}

function Section({
  icon, title, children, empty, emptyText, hint,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  empty?: boolean;
  emptyText?: string;
  hint?: string;
}) {
  return (
    <section className="space-y-2">
      <header className="flex items-center gap-2">
        <span className="text-secondary">{icon}</span>
        <h2 className="font-black text-secondary text-base">{title}</h2>
      </header>
      {hint && <p className="text-[11px] font-bold text-muted-foreground">{hint}</p>}
      {empty ? (
        <p className="rounded-xl border-2 border-dashed border-secondary/40 bg-surface p-4 text-center text-xs font-bold text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        children
      )}
    </section>
  );
}

function FreshnessBar({ buckets, total }: { buckets: FreshnessBucket[]; total: number }) {
  if (total === 0) return null;
  const tone: Record<FreshnessBucket["label"], string> = {
    fresh: "bg-primary",
    recent: "bg-primary/60",
    stale: "bg-warning",
    very_stale: "bg-destructive",
  };
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full border-2 border-secondary">
      {buckets.map((b) => (
        <div key={b.label} className={tone[b.label]} style={{ width: `${(b.count / total) * 100}%` }} />
      ))}
    </div>
  );
}

function FreshnessLegend({ label, pct, tone }: { label: string; pct: number; tone: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block w-3 h-3 rounded ${tone}`} />
      <span className="flex-1 truncate">{label}</span>
      <span className="tabular-nums font-black">{pct}%</span>
    </div>
  );
}

function HourBars({ buckets }: { buckets: { hour: number; count: number }[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div className="flex items-end gap-[2px] h-20" dir="ltr">
      {buckets.map((b) => (
        <div key={b.hour} className="flex-1 flex flex-col items-center gap-1" title={`${b.hour}:00 — ${b.count}`}>
          <div className="w-full bg-primary rounded-t" style={{ height: `${(b.count / max) * 100}%`, minHeight: b.count ? 2 : 0 }} />
        </div>
      ))}
    </div>
  );
}

function DayList({ items, label }: { items: { day: string; count: number }[]; label: string }) {
  if (items.length === 0) return null;
  const max = Math.max(1, ...items.map((d) => d.count));
  return (
    <div>
      <p className="text-[11px] font-bold text-muted-foreground mb-1">{label}</p>
      <ul className="space-y-1">
        {items.map((d) => (
          <li key={d.day} className="flex items-center gap-2 text-xs">
            <span className="font-bold text-secondary w-24 tabular-nums" dir="ltr">{d.day}</span>
            <span className="flex-1 h-2 bg-muted rounded overflow-hidden">
              <span className="block h-full bg-primary" style={{ width: `${(d.count / max) * 100}%` }} />
            </span>
            <span className="font-black text-secondary tabular-nums w-8 text-end">{d.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
