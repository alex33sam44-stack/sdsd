import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { TopBar } from "@/components/TopBar";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Globe2,
  Info,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { exportSnapshot, type Snapshot } from "@/modules/shared/services/snapshot";
import {
  checkExportReadiness,
  snapshotToGtfs,
  SCHEMA_MAPPING,
  type ReadinessIssue,
  type ReadinessSeverity,
} from "@/modules/shared/services/gtfs";

const FILES = ["agency", "stops", "routes", "trips", "stop_times"] as const;
type GtfsFile = (typeof FILES)[number];

const severityStyles: Record<ReadinessSeverity, string> = {
  blocker: "bg-destructive text-destructive-foreground border-destructive",
  warning: "bg-warning/40 text-secondary border-secondary",
  info: "bg-surface-alt text-secondary border-secondary",
};

const downloadText = (filename: string, content: string, mime: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const IssueRow = ({ issue }: { issue: ReadinessIssue }) => {
  const { t } = useTranslation();
  return (
    <li className={`pill !text-xs !py-1 !px-2 ${severityStyles[issue.severity]} flex items-start gap-2 w-full justify-start`}>
      {issue.severity === "blocker" && <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={2.5} />}
      {issue.severity === "warning" && <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={2.5} />}
      {issue.severity === "info" && <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={2.5} />}
      <span className="flex-1 text-start font-bold">
        {t(issue.key, issue.vars as Record<string, string | number> | undefined)}
        {issue.entity && (
          <span className="opacity-80 font-semibold"> — {issue.entity}</span>
        )}
      </span>
    </li>
  );
};

export default function AdminInteroperability() {
  const { t } = useTranslation();
  const [snap, setSnap] = useState<Snapshot | null>(null);

  const q = useQuery({
    queryKey: ["admin:interop:snapshot"],
    queryFn: async () => {
      const s = await exportSnapshot();
      setSnap(s);
      return s;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const report = useMemo(() => (snap ? checkExportReadiness(snap) : null), [snap]);
  const bundle = useMemo(() => (snap ? snapshotToGtfs(snap) : null), [snap]);

  const handleDownloadFile = (file: GtfsFile) => {
    if (!bundle) return;
    downloadText(`${file}.txt`, bundle.csv[file] ?? "", "text/csv;charset=utf-8");
  };

  const handleDownloadAll = () => {
    if (!bundle) return;
    // No external zip dep — emit a single concatenated CSV bundle the
    // operator can split, plus a JSON sibling for programmatic consumers.
    const concatenated = FILES.map(
      (f) => `# ${f}.txt\n${bundle.csv[f]}\n`
    ).join("\n");
    downloadText("gtfs-like-bundle.txt", concatenated, "text/plain;charset=utf-8");
    downloadText(
      "gtfs-like-bundle.json",
      JSON.stringify(
        {
          agency: bundle.agency,
          stops: bundle.stops,
          routes: bundle.routes,
          trips: bundle.trips,
          stop_times: bundle.stop_times,
        },
        null,
        2
      ),
      "application/json"
    );
  };

  const handleDownloadMapping = () => {
    const header = "ourEntity,ourField,gtfsFile,gtfsField,notes";
    const rows = SCHEMA_MAPPING.map((r) =>
      [r.ourEntity, r.ourField, r.gtfsFile, r.gtfsField, r.notes]
        .map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v))
        .join(",")
    );
    downloadText(
      "schema-mapping.csv",
      [header, ...rows].join("\n"),
      "text/csv;charset=utf-8"
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <TopBar
        title={t("adminInterop.title", "الجاهزية للبيانات المفتوحة")}
        backTo="/admin"
      />
      <div className="px-5 pt-4 pb-10 space-y-4">
        <section className="card-tactile bg-secondary text-secondary-foreground">
          <div className="flex items-start gap-3">
            <Globe2 className="w-5 h-5 text-primary mt-1 shrink-0" strokeWidth={2.5} />
            <div className="space-y-1">
              <p className="font-black text-primary text-sm">
                {t("adminInterop.headline", "تصدير متوافق مع GTFS-like للنشر المفتوح")}
              </p>
              <p className="text-xs font-semibold opacity-90 leading-relaxed">
                {t(
                  "adminInterop.intro",
                  "هذه الأداة لا تغيّر بياناتك. تقرأ آخر لقطة وتطبّق فحوصات الجاهزية + تصدير CSV متوافق."
                )}
              </p>
            </div>
          </div>
        </section>

        {q.isLoading && (
          <div className="card-tactile flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="font-bold text-secondary">
              {t("adminInterop.loading", "جاري قراءة البيانات...")}
            </span>
          </div>
        )}

        {q.isError && (
          <div className="card-tactile bg-destructive text-destructive-foreground">
            <p className="font-black">
              {t("adminInterop.loadError", "تعذّر تحميل البيانات")}
            </p>
          </div>
        )}

        {report && (
          <>
            {/* Readiness overview */}
            <section className="card-tactile space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-black text-secondary inline-flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" strokeWidth={2.5} />
                  {t("adminInterop.readiness", "فحوصات الجاهزية")}
                </h3>
                <button
                  type="button"
                  onClick={() => q.refetch()}
                  className="btn-secondary !h-8 !text-xs !px-3"
                >
                  <RefreshCw className="w-3.5 h-3.5" strokeWidth={2.5} />
                  {t("common.refresh", "تحديث")}
                </button>
              </div>

              <div
                className={`rounded-lg border-2 p-3 ${
                  report.readyToPublish
                    ? "bg-success text-success-foreground border-secondary"
                    : "bg-destructive text-destructive-foreground border-destructive"
                }`}
              >
                <p className="font-black inline-flex items-center gap-2">
                  {report.readyToPublish ? (
                    <CheckCircle2 className="w-4 h-4" strokeWidth={2.5} />
                  ) : (
                    <XCircle className="w-4 h-4" strokeWidth={2.5} />
                  )}
                  {report.readyToPublish
                    ? t("adminInterop.ready", "جاهز للنشر — لا توجد عوائق")
                    : t("adminInterop.notReady", "غير جاهز — راجع العوائق أدناه")}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {([
                  ["stations", report.totals.stations],
                  ["lines", report.totals.lines],
                  ["stops", report.totals.stops],
                  ["publishedLines", report.totals.publishedLines],
                  ["geocodedStops", report.totals.geocodedStops],
                ] as const).map(([k, v]) => (
                  <div key={k} className="rounded-lg border-2 border-secondary bg-surface p-2 text-center">
                    <p className="text-[10px] font-bold text-muted-foreground">
                      {t(`adminInterop.totals.${k}`)}
                    </p>
                    <p className="text-lg font-black text-secondary tabular-nums">{v}</p>
                  </div>
                ))}
              </div>

              {report.blockers.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-black text-destructive">
                    {t("adminInterop.blockersN", { n: report.blockers.length })}
                  </p>
                  <ul className="space-y-1.5">
                    {report.blockers.slice(0, 20).map((b, i) => (
                      <IssueRow key={i} issue={b} />
                    ))}
                  </ul>
                </div>
              )}

              {report.warnings.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-black text-secondary">
                    {t("adminInterop.warningsN", { n: report.warnings.length })}
                  </p>
                  <ul className="space-y-1.5">
                    {report.warnings.slice(0, 20).map((w, i) => (
                      <IssueRow key={i} issue={w} />
                    ))}
                  </ul>
                </div>
              )}

              {report.infos.length > 0 && (
                <details className="text-xs">
                  <summary className="font-black text-muted-foreground cursor-pointer">
                    {t("adminInterop.infosN", { n: report.infos.length })}
                  </summary>
                  <ul className="space-y-1.5 mt-2">
                    {report.infos.slice(0, 20).map((it, i) => (
                      <IssueRow key={i} issue={it} />
                    ))}
                  </ul>
                </details>
              )}
            </section>

            {/* Downloads */}
            <section className="card-tactile space-y-3">
              <h3 className="font-black text-secondary inline-flex items-center gap-2">
                <Download className="w-4 h-4" strokeWidth={2.5} />
                {t("adminInterop.downloads", "تنزيلات GTFS-like")}
              </h3>
              <p className="text-xs font-semibold text-muted-foreground leading-relaxed">
                {t(
                  "adminInterop.downloadsHint",
                  "التصدير الحالي بصيغة JSON للنظام يبقى كما هو. هذه ملفات إضافية للنشر الخارجي."
                )}
              </p>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleDownloadAll}
                  disabled={!bundle}
                  className="btn-primary !h-10 !text-sm"
                >
                  <Download className="w-4 h-4" strokeWidth={2.5} />
                  {t("adminInterop.downloadAll", "تنزيل الحزمة الكاملة")}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadMapping}
                  className="btn-secondary !h-10 !text-sm"
                >
                  <FileText className="w-4 h-4" strokeWidth={2.5} />
                  {t("adminInterop.downloadMapping", "وثيقة التطابق (CSV)")}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {FILES.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => handleDownloadFile(f)}
                    disabled={!bundle}
                    className="btn-secondary !h-10 !text-xs !px-2 truncate"
                    title={`${f}.txt`}
                  >
                    {f}.txt
                  </button>
                ))}
              </div>
            </section>

            {/* Mapping table */}
            <section className="card-tactile space-y-3">
              <h3 className="font-black text-secondary inline-flex items-center gap-2">
                <FileText className="w-4 h-4" strokeWidth={2.5} />
                {t("adminInterop.mapping", "خريطة التطابق مع GTFS")}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-start">
                    <tr className="border-b-2 border-secondary">
                      <th className="text-start font-black p-2">{t("adminInterop.col.entity", "الكيان")}</th>
                      <th className="text-start font-black p-2">{t("adminInterop.col.field", "الحقل عندنا")}</th>
                      <th className="text-start font-black p-2">{t("adminInterop.col.gtfsFile", "ملف GTFS")}</th>
                      <th className="text-start font-black p-2">{t("adminInterop.col.gtfsField", "حقل GTFS")}</th>
                      <th className="text-start font-black p-2">{t("adminInterop.col.notes", "ملاحظات")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SCHEMA_MAPPING.map((r, i) => (
                      <tr key={i} className="border-b border-border">
                        <td className="p-2 font-bold text-secondary">{r.ourEntity}</td>
                        <td className="p-2 font-semibold">{r.ourField}</td>
                        <td className="p-2 font-semibold">{r.gtfsFile}</td>
                        <td className="p-2 font-semibold">{r.gtfsField}</td>
                        <td className="p-2 text-muted-foreground">{r.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
