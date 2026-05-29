import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ENV } from "@/lib/env";
import { isDevMode, isProdMode } from "@/lib/dataMode";
import { api } from "@/lib/api";
import { adminListAllStations } from "@/modules/shared/services/stations";
import { listAllDrafts } from "@/modules/shared/services/lines";
import { listAudit } from "@/modules/shared/services/audit";
import { authApi } from "@/lib/api";
import { logger } from "@/lib/logger";
import { isRtl } from "@/i18n";

type Status = "pass" | "warn" | "fail" | "pending";
type Check = {
  id: string;
  labelKey: string;
  labelVars?: Record<string, string | number>;
  detailKey?: string;
  status: Status;
};

/** Internal deployment-readiness page. Operators and platform_admin only
 *  (route is guarded in App.tsx). Read-only — no mutations. */
export default function AdminDeploymentChecklist() {
  const { t, i18n } = useTranslation();
  const [checks, setChecks] = useState<Check[]>([]);
  const [running, setRunning] = useState(true);

  useEffect(() => { void run(setChecks, setRunning); }, []);

  const total = checks.length;
  const passed = checks.filter((c) => c.status === "pass").length;
  const warned = checks.filter((c) => c.status === "warn").length;
  const failed = checks.filter((c) => c.status === "fail").length;
  const dir = isRtl(i18n.language) ? "rtl" : "ltr";

  return (
    <div dir={dir} className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <header className="space-y-1">
          <h1 className="text-3xl font-black text-secondary">{t("deploy.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("deploy.subtitle")}</p>
        </header>

        {/* Build info */}
        <Section title={t("deploy.buildInfo")}>
          <KV label={t("deploy.dataMode")} value={ENV.dataMode} tone={isProdMode() ? "prod" : "dev"} />
          <KV label={t("deploy.release")} value={ENV.release} />
          <KV label={t("deploy.viteMode")} value={ENV.mode} />
          <KV
            label={t("deploy.backendConfig")}
            value={ENV.hasBackendConfig ? t("deploy.configured") : t("deploy.missing")}
            tone={ENV.hasBackendConfig ? "ok" : "fail"}
          />
        </Section>

        {/* Summary */}
        <Section title={t("deploy.summary")}>
          <div className="flex flex-wrap gap-3 text-sm">
            <Pill tone="ok">{t("deploy.passed", { n: passed })}</Pill>
            <Pill tone="warn">{t("deploy.warned", { n: warned })}</Pill>
            <Pill tone="fail">{t("deploy.failedN", { n: failed })}</Pill>
            <Pill tone="muted">{t("deploy.totalN", { n: total })}</Pill>
            {running && <Pill tone="muted">{t("deploy.running")}</Pill>}
          </div>
        </Section>

        {/* Checks */}
        <Section title={t("deploy.checks")}>
          <ul className="space-y-2">
            {checks.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-border bg-card p-3 flex items-start gap-3"
              >
                <StatusDot status={c.status} />
                <div className="space-y-0.5 flex-1">
                  <p className="font-bold">{t(c.labelKey, c.labelVars ?? {})}</p>
                  {c.detailKey && (
                    <p className="text-xs text-muted-foreground whitespace-pre-line">{t(c.detailKey)}</p>
                  )}
                </div>
              </li>
            ))}
            {!checks.length && (
              <li className="text-sm text-muted-foreground">{t("deploy.noChecks")}</li>
            )}
          </ul>
        </Section>

        {/* Manual checklist */}
        <Section title={t("deploy.manual")}>
          <ol className={`list-decimal ${dir === "rtl" ? "pr-6" : "pl-6"} space-y-1 text-sm text-muted-foreground`}>
            <li>{t("deploy.manual1")}</li>
            <li>{t("deploy.manual2")}</li>
            <li>{t("deploy.manual3")}</li>
            <li>{t("deploy.manual4")}</li>
            <li>{t("deploy.manual5")}</li>
            <li>{t("deploy.manual6")}</li>
            <li>{t("deploy.manual7")}</li>
          </ol>
        </Section>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
async function run(set: (c: Check[]) => void, done: (b: boolean) => void) {
  const checks: Check[] = [];
  const push = (c: Check) => { checks.push(c); set([...checks]); };

  // 1. Data mode
  push(
    isProdMode()
      ? { id: "mode", labelKey: "deploy.checks_.modeProd", status: "pass" }
      : {
          id: "mode",
          labelKey: "deploy.checks_.modeDev",
          detailKey: "deploy.checks_.modeDevDetail",
          status: "warn",
        },
  );

  // 2. Backend config
  push(
    ENV.hasBackendConfig
      ? { id: "config", labelKey: "deploy.checks_.configOk", status: "pass" }
      : {
          id: "config",
          labelKey: "deploy.checks_.configMissing",
          detailKey: "deploy.checks_.configMissingDetail",
          status: "fail",
        },
  );

  // 3. Frontend observability
  push(
    ENV.sentryDsn
      ? { id: "sentry", labelKey: "deploy.checks_.sentryOn", status: "pass" }
      : {
          id: "sentry",
          labelKey: "deploy.checks_.sentryOff",
          detailKey: "deploy.checks_.sentryOffDetail",
          status: "warn",
        },
  );

  // 4. Auth session check (read-only ping)
  try {
    await authApi.me().catch(() => null);
    push({ id: "auth", labelKey: "deploy.checks_.authOk", status: "pass" });
  } catch (err) {
    logger.warn("deploy check: auth ping failed", { error: String(err) });
    push({ id: "auth", labelKey: "deploy.checks_.authFail", status: "fail" });
  }

  // 5. Backend health
  try {
    const health = await api.get<{ status?: string; db?: string }>("/health");
    const ok = health?.status === "ok" && (health?.db === "up" || health?.db === undefined);
    push({
      id: "health",
      labelKey: ok ? "deploy.checks_.healthOk" : "deploy.checks_.healthDegraded",
      status: ok ? "pass" : "warn",
    });
  } catch {
    push({ id: "health", labelKey: "deploy.checks_.healthFail", status: "fail" });
  }

  // 6. Stations + lines counts
  try {
    const stations = await adminListAllStations();
    const published = stations.filter((s) => s.is_published).length;
    push({
      id: "stations",
      labelKey: "deploy.checks_.stationsN",
      labelVars: { count: published },
      status: published > 0 ? "pass" : "warn",
      detailKey: published > 0 ? undefined : "deploy.checks_.stationsNoneDetail",
    });
  } catch {
    push({ id: "stations", labelKey: "deploy.checks_.stationsFail", status: "fail" });
  }

  // 7. Pending drafts
  try {
    const drafts = await listAllDrafts();
    const pending = drafts.filter((d) => d.status === "pending").length;
    push({
      id: "drafts",
      labelKey: pending === 0 ? "deploy.checks_.draftsZero" : "deploy.checks_.draftsN",
      labelVars: { count: pending },
      status: pending === 0 ? "pass" : "warn",
    });
  } catch {
    push({ id: "drafts", labelKey: "deploy.checks_.draftsFail", status: "warn" });
  }

  // 8. Recent failed mutations in audit log
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const logs = await listAudit(undefined, 200).catch(() => []);
    const n = logs.filter((l) => l.action.endsWith("_failed") && (!since || l.created_at >= since)).length;
    push({
      id: "failures",
      labelKey: n === 0 ? "deploy.checks_.failuresZero" : "deploy.checks_.failuresN",
      labelVars: { n },
      status: n === 0 ? "pass" : "warn",
      detailKey: n === 0 ? undefined : "deploy.checks_.failuresDetail",
    });
  } catch {
    push({ id: "failures", labelKey: "deploy.checks_.failuresFail", status: "warn" });
  }

  // 9. Dev seed warning
  if (isDevMode()) {
    push({
      id: "seed",
      labelKey: "deploy.checks_.seedOn",
      detailKey: "deploy.checks_.seedOnDetail",
      status: "warn",
    });
  }

  done(false);
}

// ─────────────────────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-black">{title}</h2>
      <div className="rounded-xl border border-border bg-card p-4 space-y-2">{children}</div>
    </section>
  );
}

function KV({ label, value, tone }: { label: string; value: string; tone?: "ok" | "fail" | "prod" | "dev" }) {
  const cls =
    tone === "ok" || tone === "prod" ? "text-secondary" :
    tone === "fail" ? "text-destructive" :
    tone === "dev" ? "text-amber-600" : "text-foreground";
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono font-bold ${cls}`}>{value}</span>
    </div>
  );
}

function Pill({ tone, children }: { tone: "ok" | "warn" | "fail" | "muted"; children: React.ReactNode }) {
  const cls =
    tone === "ok" ? "bg-secondary/15 text-secondary" :
    tone === "warn" ? "bg-amber-500/15 text-amber-700" :
    tone === "fail" ? "bg-destructive/15 text-destructive" :
    "bg-muted text-muted-foreground";
  return <span className={`px-2.5 py-1 rounded-full font-bold ${cls}`}>{children}</span>;
}

function StatusDot({ status }: { status: Status }) {
  const cls =
    status === "pass" ? "bg-secondary" :
    status === "warn" ? "bg-amber-500" :
    status === "fail" ? "bg-destructive" :
    "bg-muted-foreground";
  return <span className={`mt-1.5 inline-block h-2.5 w-2.5 rounded-full ${cls}`} aria-hidden />;
}
