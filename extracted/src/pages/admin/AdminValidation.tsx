import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TopBar } from "@/components/TopBar";
import {
  runValidation,
  CATEGORY_AR,
  type Issue,
  type IssueLevel,
  type IssueCategory,
} from "@/modules/shared/services/validation";
import { adminListAllStations } from "@/modules/shared/services/stations";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  EyeOff,
  Info,
  Loader2,
  RefreshCw,
  Unlink,
  XCircle,
} from "lucide-react";

const LEVEL_ORDER: IssueLevel[] = ["error", "warning", "info"];
const LEVEL_KEY: Record<IssueLevel, string> = {
  error: "adminValidation.levelError",
  warning: "adminValidation.levelWarning",
  info: "adminValidation.levelInfo",
};

// Categories that mean "this entity is hidden / inactive / broken in passenger flow"
const FLAG_HIDDEN: ReadonlySet<IssueCategory> = new Set([
  "line_published",
  "station_published",
]);
const FLAG_BROKEN: ReadonlySet<IssueCategory> = new Set([
  "line_visible_but_stopped",
  "line_orphan_published",
  "line_no_stops",
  "stop_orphan",
  "stop_ordering",
  "line_cars_negative",
]);
const FLAG_INACTIVE: ReadonlySet<IssueCategory> = new Set([
  "line_status",
]);

const AdminValidation = () => {
  const { t } = useTranslation();
  const [stations, setStations] = useState<any[]>([]);
  const [stationId, setStationId] = useState<string>("");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeLevels, setActiveLevels] = useState<Set<IssueLevel>>(
    new Set(LEVEL_ORDER),
  );

  useEffect(() => {
    adminListAllStations()
      .then((list) => {
        const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
        setStations(sorted.map((s) => ({ id: s.id, name: s.name, area: s.area })));
      })
      .catch(() => setStations([]));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    runValidation(stationId || undefined)
      .then((rs) => {
        if (alive) setIssues(rs);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [stationId, reloadKey]);

  const counts = useMemo(() => {
    const c: Record<IssueLevel, number> = { error: 0, warning: 0, info: 0 };
    issues.forEach((i) => c[i.level]++);
    return c;
  }, [issues]);

  const visibleIssues = useMemo(
    () => issues.filter((i) => activeLevels.has(i.level)),
    [issues, activeLevels],
  );

  // Group by level → category for the warning-cards layout.
  const grouped = useMemo(() => {
    const out: Record<IssueLevel, Map<IssueCategory, Issue[]>> = {
      error: new Map(),
      warning: new Map(),
      info: new Map(),
    };
    for (const issue of visibleIssues) {
      const bucket = out[issue.level];
      const arr = bucket.get(issue.category) ?? [];
      arr.push(issue);
      bucket.set(issue.category, arr);
    }
    return out;
  }, [visibleIssues]);

  const toggleLevel = (lvl: IssueLevel) => {
    setActiveLevels((prev) => {
      const next = new Set(prev);
      if (next.has(lvl)) next.delete(lvl);
      else next.add(lvl);
      // Don't allow zero — treat "all off" as "all on" toggle.
      if (next.size === 0) return new Set(LEVEL_ORDER);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <TopBar title={t("admin.validationTitle")} backTo="/admin" />
      <div className="px-5 pt-5 pb-10 space-y-4">
        <section className="rounded-2xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm">
          <label className="block text-sm font-black text-secondary mb-1.5">
            {t("adminValidation.scope")}
          </label>
          <div className="flex gap-2">
            <select
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              className="input-admin flex-1"
            >
              <option value="">{t("adminValidation.allStations")}</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.area}
                </option>
              ))}
            </select>
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              aria-label={t("adminValidation.rerun")}
              className="h-12 w-12 shrink-0 rounded-lg border-2 border-secondary bg-primary text-secondary grid place-items-center shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform"
            >
              <RefreshCw className="w-5 h-5" strokeWidth={2.5} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <Stat
              label={t("adminValidation.issues")}
              count={counts.error}
              kind="error"
              active={activeLevels.has("error")}
              onClick={() => toggleLevel("error")}
            />
            <Stat
              label={t("adminValidation.warnings")}
              count={counts.warning}
              kind="warning"
              active={activeLevels.has("warning")}
              onClick={() => toggleLevel("warning")}
            />
            <Stat
              label={t("adminValidation.notes")}
              count={counts.info}
              kind="info"
              active={activeLevels.has("info")}
              onClick={() => toggleLevel("info")}
            />
          </div>
          <p className="text-[11px] font-semibold text-secondary/70 mt-2 text-pretty">
            {t("adminValidation.toggleHint")}
          </p>
        </section>

        {loading ? (
          <div className="grid place-items-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-secondary" />
          </div>
        ) : issues.length === 0 ? (
          <div className="rounded-2xl border-2 border-success bg-success/10 p-5 flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-success shrink-0" strokeWidth={2.5} />
            <div>
              <p className="font-black text-secondary">{t("adminValidation.allClean")}</p>
              <p className="text-sm font-semibold text-secondary/80 mt-0.5">
                {t("adminValidation.noIssuesScope")}
              </p>
            </div>
          </div>
        ) : visibleIssues.length === 0 ? (
          <div className="rounded-2xl border-2 border-secondary bg-surface-alt p-5 text-center">
            <p className="font-black text-secondary text-sm">
              {t("adminValidation.noMatch")}
            </p>
          </div>
        ) : (
          LEVEL_ORDER.map((level) => {
            const buckets = grouped[level];
            if (buckets.size === 0) return null;
            return (
              <SeveritySection
                key={level}
                level={level}
                title={t(LEVEL_KEY[level])}
                buckets={buckets}
              />
            );
          })
        )}
      </div>
    </div>
  );
};

const Stat = ({
  label,
  count,
  kind,
  active,
  onClick,
}: {
  label: string;
  count: number;
  kind: IssueLevel;
  active: boolean;
  onClick: () => void;
}) => {
  const baseStyles =
    kind === "error"
      ? "border-destructive bg-destructive/10 text-destructive"
      : kind === "warning"
        ? "border-secondary bg-primary/30 text-secondary"
        : "border-secondary bg-surface-alt text-secondary";
  const dim = active ? "" : "opacity-40";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl border-2 p-3 text-center shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-[opacity,transform] ${baseStyles} ${dim}`}
    >
      <p className="text-2xl font-black tabular-nums">{count}</p>
      <p className="text-xs font-bold">{label}</p>
    </button>
  );
};

const SeveritySection = ({
  level,
  title,
  buckets,
}: {
  level: IssueLevel;
  title: string;
  buckets: Map<IssueCategory, Issue[]>;
}) => {
  const Icon = level === "error" ? XCircle : level === "warning" ? AlertTriangle : Info;
  const headerTone =
    level === "error"
      ? "border-destructive bg-destructive text-destructive-foreground"
      : level === "warning"
        ? "border-secondary bg-primary text-secondary"
        : "border-secondary bg-surface-alt text-secondary";
  const total = Array.from(buckets.values()).reduce((n, a) => n + a.length, 0);
  return (
    <section className="space-y-3">
      <header
        className={`rounded-xl border-2 px-4 py-2 flex items-center gap-2 shadow-tactile-sm ${headerTone}`}
      >
        <Icon className="w-5 h-5 shrink-0" strokeWidth={2.5} />
        <h2 className="font-black text-sm flex-1">{title}</h2>
        <span className="text-xs font-black tabular-nums">{total}</span>
      </header>
      <div className="space-y-3 pr-2">
        {Array.from(buckets.entries()).map(([cat, list]) => (
          <CategoryGroup key={cat} category={cat} level={level} list={list} />
        ))}
      </div>
    </section>
  );
};

const CategoryGroup = ({
  category,
  level,
  list,
}: {
  category: IssueCategory;
  level: IssueLevel;
  list: Issue[];
}) => {
  const tone =
    level === "error"
      ? "border-destructive bg-destructive/10"
      : level === "warning"
        ? "border-secondary bg-primary/15"
        : "border-secondary bg-surface-alt";
  return (
    <div className={`rounded-xl border-2 p-3 shadow-tactile-sm ${tone}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="font-black text-secondary text-sm">{CATEGORY_AR[category]}</p>
        <span className="pill bg-surface text-secondary text-[10px] tabular-nums">
          {list.length}
        </span>
      </div>
      <ul className="space-y-2">
        {list.map((issue) => (
          <IssueRow key={issue.id} issue={issue} />
        ))}
      </ul>
    </div>
  );
};

/** Pick the most actionable edit link for an issue. */
function buildAction(
  issue: Issue,
  t: (k: string) => string,
): { to: string; label: string } | null {
  if (
    (issue.entity === "line" &&
      (issue.category === "stop_ordering" || issue.category === "line_no_stops")) ||
    (issue.entity === "route_stop" && issue.category !== "stop_orphan")
  ) {
    if (issue.lineId && issue.stationId) {
      return {
        to: `/admin/route/${issue.stationId}/${issue.lineId}`,
        label: t("adminValidation.actionEditStops"),
      };
    }
  }

  if (issue.entity === "line" && issue.lineId && issue.stationId) {
    return {
      to: `/admin/line/${issue.stationId}/${issue.lineId}`,
      label: t("adminValidation.actionOpenLine"),
    };
  }
  if (issue.entity === "layout_zone" && issue.stationId) {
    return {
      to: `/admin/layout/${issue.stationId}`,
      label: t("adminValidation.actionOpenLayout"),
    };
  }
  if (issue.entity === "station" && issue.stationId) {
    return {
      to: `/admin/layout/${issue.stationId}`,
      label: t("adminValidation.actionOpenStation"),
    };
  }
  if (issue.entity === "route_stop" && issue.category === "stop_orphan") {
    return { to: `/admin/tools`, label: t("adminValidation.actionOpenDataTools") };
  }
  return null;
}

function flagFor(
  category: IssueCategory,
  t: (k: string) => string,
): {
  label: string;
  Icon: typeof EyeOff;
  className: string;
} | null {
  if (FLAG_BROKEN.has(category))
    return {
      label: t("adminValidation.flagBroken"),
      Icon: Unlink,
      className: "bg-destructive text-destructive-foreground",
    };
  if (FLAG_HIDDEN.has(category))
    return {
      label: t("adminValidation.flagHidden"),
      Icon: EyeOff,
      className: "bg-surface-alt text-secondary border border-secondary",
    };
  if (FLAG_INACTIVE.has(category))
    return {
      label: t("adminValidation.flagInactive"),
      Icon: AlertTriangle,
      className: "bg-primary text-secondary border border-secondary",
    };
  return null;
}

const IssueRow = ({ issue }: { issue: Issue }) => {
  const { t } = useTranslation();
  const action = buildAction(issue, t);
  const flag = flagFor(issue.category, t);
  return (
    <li className="rounded-lg border-2 border-secondary bg-surface px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <p className="font-black text-secondary text-sm text-balance flex-1">
          {issue.title}
        </p>
        {flag && (
          <span
            className={`shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-black ${flag.className}`}
          >
            <flag.Icon className="w-3 h-3" strokeWidth={2.5} />
            {flag.label}
          </span>
        )}
      </div>
      <p className="text-xs font-semibold text-secondary/80 mt-0.5 text-pretty">
        {issue.detail}
      </p>
      {action && (
        <Link
          to={action.to}
          className="inline-flex items-center gap-1 text-xs font-black text-secondary underline mt-1.5"
        >
          {action.label}
          <ChevronLeft className="w-3 h-3" strokeWidth={2.5} />
        </Link>
      )}
    </li>
  );
};

export default AdminValidation;
