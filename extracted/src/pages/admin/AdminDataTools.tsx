import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TopBar } from "@/components/TopBar";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileJson,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  buildSnapshotFilename,
  exportSnapshot,
  importSnapshot,
  migrateLegacyOverrides,
  previewSnapshot,
  type ImportPreview,
  type ImportReportEntry,
  type Snapshot,
} from "@/modules/shared/services/snapshot";
import {
  migrateLegacySeed,
  type MigrationReport,
} from "@/modules/shared/services/legacyMigration";
import { adminListAllStations } from "@/modules/shared/services/stations";
import { isDevMode } from "@/lib/dataMode";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type StationOption = { id: string; name: string; area: string | null };

const AdminDataTools = () => {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stations, setStations] = useState<StationOption[]>([]);
  const [scopeId, setScopeId] = useState<string>("");
  const [pending, setPending] = useState<{ snap: Snapshot; preview: ImportPreview } | null>(null);
  const [report, setReport] = useState<ImportReportEntry[] | null>(null);
  const [seedReport, setSeedReport] = useState<MigrationReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [additive, setAdditive] = useState(false);
  const devMode = isDevMode();

  useEffect(() => {
    let cancelled = false;
    adminListAllStations()
      .then((data) => {
        if (cancelled) return;
        setStations(
          (data ?? [])
            .map((s) => ({ id: s.id, name: s.name, area: s.area ?? null }))
            .sort((a, b) => a.name.localeCompare(b.name, "ar")),
        );
      })
      .catch(() => {
        if (!cancelled) setStations([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Export ──────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setBusy(true);
    try {
      const snap = await exportSnapshot(scopeId || undefined);
      const filename = buildSnapshotFilename(snap);
      const blob = new Blob([JSON.stringify(snap, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const totalRows =
        snap.stations.length +
        snap.station_layouts.length +
        snap.lines.length +
        snap.route_stops.length +
        snap.layout_zones.length;
      toast.success(t("adminData.exportSuccess", { rows: totalRows, filename }));
    } catch (e: any) {
      toast.error(e?.message ?? t("adminData.exportFailed"));
    }
    setBusy(false);
  };

  // ── Import: pick → preview → confirm → import ───────────────────────────
  const onPickFile = () => fileRef.current?.click();
  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      return toast.error(t("adminData.fileTooLarge"));
    }
    setBusy(true);
    try {
      const raw = JSON.parse(await f.text());
      const preview = await previewSnapshot(raw);
      setPending({ snap: raw as Snapshot, preview });
    } catch {
      toast.error(t("adminData.fileNotJson"));
    }
    setBusy(false);
  };

  const confirmImport = async () => {
    if (!pending) return;
    setBusy(true);
    const r = await importSnapshot(pending.snap, { additive });
    setPending(null);
    setBusy(false);
    setReport(r.report);
    if (r.ok === true) {
      const totals = Object.values(r.counts).reduce(
        (acc, c) => ({
          inserted: acc.inserted + c.inserted,
          overwritten: acc.overwritten + c.overwritten,
          skipped: acc.skipped + c.skipped,
        }),
        { inserted: 0, overwritten: 0, skipped: 0 },
      );
      toast.success(
        t("adminData.importSuccess", {
          inserted: totals.inserted,
          overwritten: totals.overwritten,
          skipped: totals.skipped
            ? t("adminData.skippedSuffix", { n: totals.skipped })
            : "",
        }),
      );
    } else {
      toast.error(r.error);
    }
  };

  // ── Legacy localStorage overrides migration ─────────────────────────────
  const runMigration = async () => {
    setBusy(true);
    const r = await migrateLegacyOverrides();
    setBusy(false);
    if (r.ok === true) {
      toast.success(t("adminData.legacyMoved", { n: r.updated }));
    } else {
      toast.error(r.error);
    }
  };

  const runSeedPreview = async () => {
    setBusy(true);
    const r = await migrateLegacySeed({ dryRun: true });
    setBusy(false);
    setSeedReport(r);
    if (r.ok) toast.success(t("adminData.previewReady"));
    else toast.error(t("adminData.previewFailed"));
  };

  const runSeedCommit = async () => {
    setBusy(true);
    const r = await migrateLegacySeed();
    setBusy(false);
    setSeedReport(r);
    if (r.ok) {
      toast.success(
        t("adminData.migrationDone", { imported: r.totals.imported, skipped: r.totals.skipped }),
      );
    } else {
      toast.error(t("adminData.migrationFailed", { n: r.totals.errors }));
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <TopBar title={t("admin.dataToolsTitle")} backTo="/admin" />
      <div className="px-5 pt-5 pb-10 space-y-5">
        {/* Export */}
        <section className="rounded-2xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm space-y-3">
          <div>
            <h2 className="font-black text-secondary text-lg">{t("adminData.exportTitle")}</h2>
            <p className="text-xs text-muted-foreground font-semibold mt-1 text-pretty">
              {t("adminData.exportDesc")}
            </p>
          </div>
          <label className="block">
            <span className="block text-xs font-black text-secondary mb-1.5">{t("adminData.exportScope")}</span>
            <select
              value={scopeId}
              onChange={(e) => setScopeId(e.target.value)}
              className="input-admin"
            >
              <option value="">{t("adminData.scopeAll")}</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.area ? `— ${s.area}` : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={handleExport}
            disabled={busy}
            className="w-full h-12 rounded-lg border-2 border-secondary bg-primary text-secondary font-black flex items-center justify-center gap-2 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" strokeWidth={2.5} />}
            {t("adminData.downloadJson")}
          </button>
        </section>

        {/* Import */}
        <section className="rounded-2xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm space-y-3">
          <div>
            <h2 className="font-black text-secondary text-lg">{t("adminData.importTitle")}</h2>
            <p className="text-xs text-muted-foreground font-semibold mt-1 text-pretty">
              {t("adminData.importDesc")}
            </p>
          </div>
          <label className="flex items-start gap-2 rounded-lg border-2 border-secondary bg-surface-alt px-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={additive}
              onChange={(e) => setAdditive(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-secondary"
            />
            <span className="text-xs font-bold text-secondary text-pretty">
              <span className="font-black">{t("adminData.additiveLabel")}</span> {t("adminData.additiveDesc")}
            </span>
          </label>
          <button
            onClick={onPickFile}
            disabled={busy}
            className="w-full h-12 rounded-lg border-2 border-secondary bg-secondary text-secondary-foreground font-black flex items-center justify-center gap-2 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform disabled:opacity-50"
          >
            <Upload className="w-4 h-4" strokeWidth={2.5} />
            {t("adminData.pickFile")}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={onFileChosen}
            className="hidden"
          />
        </section>

        {/* Last import report */}
        {report && (
          <ReportCard
            title={t("adminData.lastImportReport")}
            entries={report}
            onDismiss={() => setReport(null)}
          />
        )}

        {/* Seed migration (dev-only) */}
        <section className="rounded-2xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm space-y-3">
          <div>
            <h2 className="font-black text-secondary text-lg">{t("adminData.seedTitle")}</h2>
            <p className="text-xs text-muted-foreground font-semibold mt-1 text-pretty">
              {t("adminData.seedDesc")}
            </p>
            {!devMode && (
              <p className="text-xs font-black text-destructive mt-2">
                {t("adminData.devOnly")}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={runSeedPreview}
              disabled={busy || !devMode}
              className="h-12 rounded-lg border-2 border-secondary bg-surface text-secondary font-black flex items-center justify-center gap-2 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileJson className="w-4 h-4" strokeWidth={2.5} />}
              {t("adminData.previewDryRun")}
            </button>
            <button
              onClick={runSeedCommit}
              disabled={busy || !devMode}
              className="h-12 rounded-lg border-2 border-secondary bg-primary text-secondary font-black flex items-center justify-center gap-2 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" strokeWidth={2.5} />}
              {t("adminData.runMigration")}
            </button>
          </div>
        </section>

        {seedReport && (
          <MigrationReportCard
            report={seedReport}
            onDismiss={() => setSeedReport(null)}
          />
        )}

        {/* Legacy localStorage overrides migration */}
        <section className="rounded-2xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm">
          <h2 className="font-black text-secondary text-lg mb-1">{t("adminData.legacyTitle")}</h2>
          <p className="text-xs text-muted-foreground font-semibold mb-3 text-pretty">
            {t("adminData.legacyDesc")}
          </p>
          <button
            onClick={runMigration}
            disabled={busy || !devMode}
            className="w-full h-12 rounded-lg border-2 border-secondary bg-primary/40 text-secondary font-black flex items-center justify-center gap-2 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" strokeWidth={2.5} />}
            {t("adminData.moveNow")}
          </button>
        </section>
      </div>

      {/* Confirmation dialog with preview */}
      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FileJson className="w-5 h-5 text-secondary" strokeWidth={2.5} />
              {t("adminData.confirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              {additive
                ? t("adminData.confirmAdditive")
                : t("adminData.confirmReplace")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {pending && <PreviewBody preview={pending.preview} additive={additive} />}

          <AlertDialogFooter>
            <AlertDialogCancel>{t("adminData.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmImport}
              disabled={!pending?.preview.ok}
              className={
                additive
                  ? "bg-secondary text-secondary-foreground hover:bg-secondary/90 disabled:opacity-50"
                  : "bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              }
            >
              {pending?.preview.ok
                ? additive
                  ? t("adminData.addNewOnly")
                  : t("adminData.replaceData")
                : t("adminData.fixErrors")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ── Preview body inside the confirm dialog ──────────────────────────────────
const PreviewBody = ({
  preview,
  additive,
}: {
  preview: ImportPreview;
  additive: boolean;
}) => {
  const { t } = useTranslation();
  const totalRows = Object.values(preview.counts).reduce((a, b) => a + b, 0);
  const totalOverwrite =
    preview.willOverwrite.stations +
    preview.willOverwrite.lines +
    preview.willOverwrite.route_stops +
    preview.willOverwrite.layout_zones;
  const totalInsert =
    preview.willInsert.stations +
    preview.willInsert.lines +
    preview.willInsert.route_stops +
    preview.willInsert.layout_zones;
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-lg border-2 border-secondary bg-surface-alt p-3 space-y-1">
        <Row k={t("adminData.fileVersion")} v={preview.schema ?? "—"} />
        <Row k={t("adminData.exportedAt")} v={preview.exportedAt?.slice(0, 19).replace("T", " ") ?? "—"} />
        <Row k={t("adminData.fileScope")} v={preview.scope?.stationName ?? t("adminData.scopeAll")} />
        <Row k={t("adminData.totalRows")} v={totalRows.toString()} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <CountChip label={t("adminData.stations")} n={preview.counts.stations} />
        <CountChip label={t("adminData.layouts")} n={preview.counts.station_layouts} />
        <CountChip label={t("adminData.lines")} n={preview.counts.lines} />
        <CountChip label={t("adminData.stops")} n={preview.counts.route_stops} />
        <CountChip label={t("adminData.zones")} n={preview.counts.layout_zones} />
      </div>

      {preview.ok && (totalInsert > 0 || totalOverwrite > 0) && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border-2 border-success bg-success/10 px-3 py-2 text-center">
            <p className="text-xs font-bold text-secondary">{t("adminData.newRows")}</p>
            <p className="text-lg font-black tabular-nums text-secondary">{totalInsert}</p>
          </div>
          <div
            className={`rounded-lg border-2 px-3 py-2 text-center ${
              additive
                ? "border-secondary bg-surface-alt"
                : "border-destructive bg-destructive/10"
            }`}
          >
            <p className="text-xs font-bold text-secondary">
              {additive ? t("adminData.willSkip") : t("adminData.willReplace")}
            </p>
            <p className="text-lg font-black tabular-nums text-secondary">{totalOverwrite}</p>
          </div>
        </div>
      )}

      {!additive && totalOverwrite > 0 && (
        <div className="rounded-lg border-2 border-destructive bg-destructive/10 p-3 text-secondary">
          <p className="font-black text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" strokeWidth={2.5} />
            {t("adminData.overwriteWarn")}
          </p>
          <p className="text-xs font-semibold mt-1">
            {t("adminData.overwriteDetail", {
              stations: preview.willOverwrite.stations,
              lines: preview.willOverwrite.lines,
              stops: preview.willOverwrite.route_stops,
              zones: preview.willOverwrite.layout_zones,
            })}
          </p>
        </div>
      )}

      {(preview.errors.length > 0 || preview.warnings.length > 0) && (
        <ReportEntries entries={[...preview.errors, ...preview.warnings]} maxHeight />
      )}
    </div>
  );
};

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex items-center justify-between text-xs font-semibold text-secondary">
    <span className="text-muted-foreground">{k}</span>
    <span className="font-black truncate ml-2">{v}</span>
  </div>
);

const CountChip = ({ label, n }: { label: string; n: number }) => (
  <div className="rounded-lg border-2 border-secondary bg-surface px-3 py-2 flex items-center justify-between">
    <span className="text-xs font-bold text-secondary">{label}</span>
    <span className="text-base font-black tabular-nums text-secondary">{n}</span>
  </div>
);

// ── Report card (shown after import completes) ──────────────────────────────
const ReportCard = ({
  title,
  entries,
  onDismiss,
}: {
  title: string;
  entries: ImportReportEntry[];
  onDismiss: () => void;
}) => {
  const { t } = useTranslation();
  const errors = entries.filter((e) => e.level === "error").length;
  const warnings = entries.filter((e) => e.level === "warning").length;
  const infos = entries.filter((e) => e.level === "info").length;
  return (
    <section className="rounded-2xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm">
      <header className="flex items-center justify-between mb-3">
        <h2 className="font-black text-secondary text-lg">{title}</h2>
        <button
          onClick={onDismiss}
          className="text-xs font-black text-secondary underline"
        >
          {t("adminData.hide")}
        </button>
      </header>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <Stat label={t("adminData.success")} n={infos} kind="info" />
        <Stat label={t("adminValidation.warnings")} n={warnings} kind="warning" />
        <Stat label={t("adminData.errors")} n={errors} kind="error" />
      </div>
      <ReportEntries entries={entries} />
    </section>
  );
};

const Stat = ({
  label,
  n,
  kind,
}: {
  label: string;
  n: number;
  kind: "error" | "warning" | "info";
}) => {
  const tone =
    kind === "error"
      ? "border-destructive bg-destructive/10 text-destructive"
      : kind === "warning"
        ? "border-secondary bg-primary/30 text-secondary"
        : "border-secondary bg-success/15 text-secondary";
  return (
    <div className={`rounded-lg border-2 p-2 text-center ${tone}`}>
      <p className="text-lg font-black tabular-nums">{n}</p>
      <p className="text-[10px] font-bold">{label}</p>
    </div>
  );
};

const ReportEntries = ({
  entries,
  maxHeight,
}: {
  entries: ImportReportEntry[];
  maxHeight?: boolean;
}) => (
  <ul className={`space-y-1.5 ${maxHeight ? "max-h-48 overflow-y-auto pr-1" : ""}`}>
    {entries.map((e, i) => {
      const Icon =
        e.level === "error" ? XCircle : e.level === "warning" ? AlertTriangle : CheckCircle2;
      const color =
        e.level === "error"
          ? "text-destructive"
          : e.level === "warning"
            ? "text-secondary"
            : "text-success";
      return (
        <li
          key={i}
          className="flex items-start gap-2 text-xs font-semibold text-secondary rounded-md border border-secondary/30 bg-surface-alt px-2 py-1.5"
        >
          <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${color}`} strokeWidth={2.5} />
          <span className="text-pretty">{e.message}</span>
        </li>
      );
    })}
  </ul>
);

// ── Seed migration report card ──────────────────────────────────────────────
const MigrationReportCard = ({
  report,
  onDismiss,
}: {
  report: MigrationReport;
  onDismiss: () => void;
}) => {
  const { t } = useTranslation();
  const tot = report.totals;
  return (
    <section className="rounded-2xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm">
      <header className="flex items-center justify-between mb-3">
        <h2 className="font-black text-secondary text-lg">
          {t("adminData.migrationReport")} {report.dryRun ? t("adminData.previewSuffix") : ""}
        </h2>
        <button onClick={onDismiss} className="text-xs font-black text-secondary underline">
          {t("adminData.hide")}
        </button>
      </header>

      <div className="rounded-lg border-2 border-secondary bg-surface-alt p-3 mb-3 text-xs font-semibold text-secondary space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t("adminData.planned")}</span>
          <span className="font-black tabular-nums">
            {t("adminData.plannedDetail", {
              stations: tot.stationsPlanned,
              lines: tot.linesPlanned,
              stops: tot.stopsPlanned,
            })}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        <Stat label={t("adminData.newCount")} n={tot.imported} kind="info" />
        <Stat label={t("adminData.skipped")} n={tot.skipped} kind="warning" />
        <Stat label={t("adminData.transformed")} n={tot.transformed} kind="warning" />
        <Stat label={t("adminData.errors")} n={tot.errors} kind="error" />
      </div>

      <ReportEntries
        entries={report.entries.map((e) => ({
          level:
            e.status === "error"
              ? ("error" as const)
              : e.status === "imported"
                ? ("info" as const)
                : ("warning" as const),
          message: `[${e.table}] ${e.message}`,
        }))}
        maxHeight
      />
    </section>
  );
};

export default AdminDataTools;

