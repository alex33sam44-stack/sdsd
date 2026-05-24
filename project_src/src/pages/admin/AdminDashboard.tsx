import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TopBar } from "@/components/TopBar";
import { isRtl } from "@/i18n";
import {
  BarChart3, Building2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  CreditCard, FileEdit, FileWarning, Globe2, History, Lightbulb, Map, Plus,
  Search, ShieldCheck, Trash2, Users, X,
} from "lucide-react";
import type { Station } from "@/modules/shared/types";
import { useAuth, hasRole } from "@/modules/auth/useAuth";
import { lineStatusLabel } from "@/modules/shared/services/enums";
import { createStation, deleteStation } from "@/modules/shared/services/layout";
import { createLine } from "@/modules/shared/services/lines";
import { adminListAllStations } from "@/modules/shared/services/stations";
import { api } from "@/lib/api";
import { TenantSwitcher } from "@/modules/tenancy/TenantSwitcher";
import { useTenant } from "@/modules/tenancy/TenantContext";
import { useTenantEntitlements } from "@/modules/billing/useEntitlements";
import { snakify } from "@/modules/shared/services/_camelToSnake";
import { toast } from "sonner";

// ─── Tool catalog ────────────────────────────────────────────────────────────
// Single source of truth for every admin route. Adding/removing a tool here
// only changes presentation; the underlying routes in App.tsx still work
// (deep-links remain valid). Each tool declares its own access requirements
// so the dashboard never shows a tool the operator can't open.
type ToolGroupKey = "content" | "quality" | "team" | "advanced";

type Tool = {
  key: string;
  to: (ctx: { stationId: string }) => string;
  titleKey: string;
  titleFallback: string;
  descKey: string;
  descFallback: string;
  icon: React.ReactNode;
  group: ToolGroupKey;
  highlight?: boolean;            // Visually emphasized (primary CTA in its group)
  feature?: string;               // Entitlement gate; locks → links to /admin/billing
  platformAdminOnly?: boolean;    // Only platform admins see this
};

const TOOL_CATALOG: Tool[] = [
  // Content — daily editing surface
  {
    key: "layout",
    to: ({ stationId }) => `/admin/layout/${stationId}`,
    titleKey: "admin.layoutEditor",
    titleFallback: "محرر الرسم التخطيطي",
    descKey: "admin.layoutEditorDesc",
    descFallback: "مواقع الأرصفة والمناطق على الخريطة",
    icon: <Map className="w-5 h-5" />,
    group: "content",
    highlight: true,
  },
  {
    key: "drafts",
    to: () => "/admin/drafts",
    titleKey: "admin.drafts",
    titleFallback: "المسودات",
    descKey: "admin.draftsDesc",
    descFallback: "التعديلات اللي تستنى مراجعة",
    icon: <FileEdit className="w-5 h-5" />,
    group: "content",
    feature: "drafts",
  },

  // Quality — review & monitor existing data
  {
    key: "validation",
    to: () => "/admin/validation",
    titleKey: "admin.validation",
    titleFallback: "التحقق من البيانات",
    descKey: "admin.validationDesc",
    descFallback: "فحص الخطوط والمحطات والتخطيط",
    icon: <FileWarning className="w-5 h-5" />,
    group: "quality",
    feature: "validation",
  },
  {
    key: "review",
    to: () => "/admin/review",
    titleKey: "admin.review",
    titleFallback: "المراجعة والنشر",
    descKey: "admin.reviewDesc",
    descFallback: "اعتماد أو رفض المسودات",
    icon: <ShieldCheck className="w-5 h-5" />,
    group: "quality",
    feature: "drafts",
  },
  {
    key: "analytics",
    to: () => "/admin/analytics",
    titleKey: "admin.analytics",
    titleFallback: "تقارير وتحليلات",
    descKey: "admin.analyticsDesc",
    descFallback: "الطلب، التوفر، الحداثة، والمشاكل",
    icon: <BarChart3 className="w-5 h-5" />,
    group: "quality",
    feature: "analytics",
  },
  {
    key: "suggestions",
    to: () => "/admin/suggestions",
    titleKey: "admin.suggestions",
    titleFallback: "اقتراحات المشغّل",
    descKey: "admin.suggestionsDesc",
    descFallback: "اقتراحات تشغيلية مبنية على بيانات حقيقية",
    icon: <Lightbulb className="w-5 h-5" />,
    group: "quality",
    feature: "suggestions",
  },
  {
    key: "audit",
    to: () => "/admin/audit",
    titleKey: "admin.audit",
    titleFallback: "سجل التدقيق",
    descKey: "admin.auditDesc",
    descFallback: "تاريخ كل عملية تعديل",
    icon: <History className="w-5 h-5" />,
    group: "quality",
  },

  // Team — people and plan
  {
    key: "team",
    to: () => "/admin/team",
    titleKey: "admin.teamTitle",
    titleFallback: "فريق الجهة",
    descKey: "admin.teamDesc",
    descFallback: "دعوة الأعضاء وإدارة أدوارهم داخل الجهة الحالية",
    icon: <Users className="w-5 h-5" />,
    group: "team",
    feature: "team_management",
  },
  {
    key: "billing",
    to: () => "/admin/billing",
    titleKey: "admin.billingTitle",
    titleFallback: "الخطط والفوترة",
    descKey: "admin.billingDesc",
    descFallback: "الخطة الحالية، الحدود، واستهلاك الجهة",
    icon: <CreditCard className="w-5 h-5" />,
    group: "team",
  },

  // Advanced — power-user tools
  {
    key: "tools",
    to: () => "/admin/tools",
    titleKey: "admin.importExport",
    titleFallback: "استيراد / تصدير",
    descKey: "admin.importExportDesc",
    descFallback: "نقل البيانات JSON ونقل من النسخة المحلية",
    icon: <ShieldCheck className="w-5 h-5" />,
    group: "advanced",
    feature: "import_export",
  },
  {
    key: "interop",
    to: () => "/admin/interop",
    titleKey: "admin.interop",
    titleFallback: "الجاهزية للبيانات المفتوحة",
    descKey: "admin.interopDesc",
    descFallback: "تصدير GTFS-like + فحوصات الجاهزية",
    icon: <Globe2 className="w-5 h-5" />,
    group: "advanced",
    feature: "interoperability",
  },
  {
    key: "users",
    to: () => "/admin/users",
    titleKey: "admin.users",
    titleFallback: "المستخدمون والأدوار",
    descKey: "admin.usersDesc",
    descFallback: "إدارة الصلاحيات",
    icon: <Users className="w-5 h-5" />,
    group: "advanced",
    platformAdminOnly: true,
  },
];

// Group metadata, ordered top-to-bottom in the dashboard.
const GROUPS: Array<{
  key: ToolGroupKey;
  titleKey: string;
  titleFallback: string;
  defaultOpen: boolean;
}> = [
  { key: "content",  titleKey: "admin.groupContent",  titleFallback: "المحتوى الأساسي",  defaultOpen: true  },
  { key: "quality",  titleKey: "admin.groupQuality",  titleFallback: "الجودة والمراجعة", defaultOpen: false },
  { key: "team",     titleKey: "admin.groupTeam",     titleFallback: "الفريق والفوترة",  defaultOpen: false },
  { key: "advanced", titleKey: "admin.groupAdvanced", titleFallback: "أدوات متقدمة",     defaultOpen: false },
];

// ─── Persisted UI state ──────────────────────────────────────────────────────
// Remembering which groups the user expanded means a power-user doesn't have
// to re-open them on every visit, while a fresh operator still sees the lean
// default (only the "Content" essentials).
const STORAGE_KEY = "kiro:adminDashboard:groupOpen:v1";

function loadOpenState(): Record<ToolGroupKey, boolean> {
  if (typeof window === "undefined") return defaultOpenState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultOpenState();
    const parsed = JSON.parse(raw);
    return { ...defaultOpenState(), ...parsed };
  } catch {
    return defaultOpenState();
  }
}

function defaultOpenState(): Record<ToolGroupKey, boolean> {
  return GROUPS.reduce((acc, g) => {
    acc[g.key] = g.defaultOpen;
    return acc;
  }, {} as Record<ToolGroupKey, boolean>);
}

function saveOpenState(state: Record<ToolGroupKey, boolean>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota / private mode — silently ignore; we degrade to in-memory only.
  }
}

const AdminDashboard = () => {
  const [stations, setStations] = useState<Station[]>([]);
  const [stationId, setStationId] = useState<string>("");
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const Chevron = isRtl(i18n.language) ? ChevronLeft : ChevronRight;
  const { roles, currentTenantRole } = useAuth();
  const { currentTenant } = useTenant();
  const ent = useTenantEntitlements();
  const isAdmin = hasRole(roles, "platform_admin");
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    adminListAllStations()
      .then((list) => {
        const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
        setStations(sorted);
        if (sorted.length && !sorted.find((s) => s.id === stationId)) setStationId(sorted[0].id);
        if (!sorted.length) setStationId("");
      })
      .catch(() => setStations([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const [lines, setLines] = useState<any[]>([]);
  useEffect(() => {
    if (!stationId) { setLines([]); return; }
    api.get<unknown[]>(`/lines?stationId=${encodeURIComponent(stationId)}`)
      .then((rows) => {
        const list = snakify<any[]>(rows ?? []);
        list.sort((a, b) => (a.destination ?? "").localeCompare(b.destination ?? ""));
        setLines(list);
      })
      .catch(() => setLines([]));
  }, [stationId, reloadKey]);

  const onAddStation = async () => {
    const name = prompt(t("admin.promptStationName"));
    if (!name?.trim()) return;
    const area = prompt(t("admin.promptArea")) ?? "";
    const latStr = prompt(t("admin.promptLat")) ?? "";
    const lngStr = prompt(t("admin.promptLng")) ?? "";
    const lat = Number(latStr), lng = Number(lngStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { toast.error(t("admin.invalidCoords")); return; }
    try {
      const s = await createStation({ name, area: area || null, lat, lng });
      toast.success(t("admin.stationCreated"));
      setStationId(s.id);
      reload();
    } catch (e: any) { toast.error(e?.message ?? t("admin.createFailed")); }
  };

  const onDeleteStation = async () => {
    const s = stations.find((x) => x.id === stationId);
    if (!s) return;
    if (!confirm(t("admin.confirmDeleteStation", { name: s.name }))) return;
    try { await deleteStation(stationId); toast.success(t("admin.deleted")); reload(); }
    catch (e: any) { toast.error(e?.message ?? t("admin.deleteFailed")); }
  };

  const onAddLine = async () => {
    if (!stationId) { toast.error(t("admin.pickStationFirst")); return; }
    const destination = prompt(t("admin.promptDest"));
    if (!destination?.trim()) return;
    try {
      const l = await createLine({ station_id: stationId, destination });
      toast.success(t("admin.lineCreated"));
      navigate(`/admin/line/${stationId}/${l.id}`);
    } catch (e: any) { toast.error(e?.message ?? t("admin.createFailed")); }
  };

  // ─── Filter + per-group open state ─────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [openState, setOpenState] = useState<Record<ToolGroupKey, boolean>>(loadOpenState);

  const visibleTools = useMemo(() => {
    const q = search.trim().toLocaleLowerCase(i18n.language);
    return TOOL_CATALOG.filter((tool) => {
      // Hide tools the user has no access to — keeps the surface honest.
      if (tool.platformAdminOnly && !isAdmin) return false;
      if (!q) return true;
      const title = t(tool.titleKey, tool.titleFallback).toLocaleLowerCase(i18n.language);
      const desc  = t(tool.descKey,  tool.descFallback ).toLocaleLowerCase(i18n.language);
      return title.includes(q) || desc.includes(q);
    });
  }, [search, t, i18n.language, isAdmin]);

  const toggleGroup = (key: ToolGroupKey) => {
    setOpenState((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveOpenState(next);
      return next;
    });
  };

  // While searching, force-open every group that has a match — otherwise
  // the user types a query and sees nothing because the matching group is
  // collapsed.
  const isSearching = search.trim().length > 0;
  const matchedGroups = useMemo(() => {
    return new Set(visibleTools.map((tl) => tl.group));
  }, [visibleTools]);

  return (
    <div className="min-h-screen bg-background">
      <TopBar title={t("admin.dashboard")} backTo="/" />
      <div className="px-5 pt-5 pb-10 space-y-5">
        <div className="card-tactile bg-secondary text-secondary-foreground">
          <p className="font-black text-primary text-sm">{t("admin.cloudConnected")}</p>
          <p className="text-sm font-semibold mt-1 text-secondary-foreground/90">
            {t("admin.cloudConnectedDesc")}
          </p>
        </div>

        {!currentTenant && (
          <div className="rounded-2xl border-2 border-destructive/30 bg-surface p-4 shadow-tactile-sm space-y-2">
            <p className="font-black text-secondary">لا توجد جهة تشغيل محددة</p>
            <p className="text-sm font-semibold text-muted-foreground">
              أنشئ جهة جديدة أو اختر جهة من لوحة المنصة قبل تعديل المواقف والخطوط.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link to="/tenant/setup" className="btn-secondary">إنشاء/الانضمام إلى جهة</Link>
              <Link to="/platform" className="btn-primary">لوحة المنصة</Link>
            </div>
          </div>
        )}

        <div className="rounded-2xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm space-y-3">
          <div className="flex items-center gap-2 text-secondary font-black text-lg">
            <Building2 className="w-4 h-4" />
            الجهة الحالية
          </div>
          <p className="text-sm font-semibold text-muted-foreground">كل القراءات والتعديلات الإدارية تُنفّذ داخل الجهة المحددة هنا.</p>
          <div className="rounded-lg border-2 border-secondary/20 bg-surface-alt p-3 text-sm font-semibold text-secondary">
            {currentTenant ? `${currentTenant.name} · ${currentTenant.slug}` : "اختر جهة تشغيل أولًا من إعداد الجهة أو من لوحة المنصة قبل تنفيذ أي تعديل."}
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <TenantSwitcher />
            {currentTenantRole && <span className="pill bg-secondary text-secondary-foreground text-xs">الدور الحالي: {currentTenantRole}</span>}
          </div>
        </div>

        <div className="rounded-2xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm space-y-3">
          <label className="block text-sm font-black text-secondary">{t("admin.currentStation")}</label>
          <select value={stationId} onChange={(e) => setStationId(e.target.value)} className="w-full h-12 rounded-lg border-2 border-secondary bg-surface px-3 font-bold text-secondary focus:outline-none focus:ring-2 focus:ring-primary">
            {stations.length === 0 && <option value="">{t("admin.noStations")}</option>}
            {stations.map((s) => (
              <option key={s.id} value={s.id}>{s.name} — {s.area}{!s.is_published ? ` (${t("common.draft")})` : ""}</option>
            ))}
          </select>
          {isAdmin && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={onAddStation} className="h-11 rounded-lg border-2 border-secondary bg-primary text-secondary font-black flex items-center justify-center gap-1 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform">
                <Plus className="w-4 h-4" strokeWidth={2.5} /> {t("admin.newStation")}
              </button>
              <button onClick={onDeleteStation} disabled={!stationId} className="h-11 rounded-lg border-2 border-destructive bg-destructive text-destructive-foreground font-black flex items-center justify-center gap-1 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform disabled:opacity-50">
                <Trash2 className="w-4 h-4" strokeWidth={2.5} /> {t("admin.deleteStation")}
              </button>
            </div>
          )}
        </div>

        <section>
          <header className="mb-3 flex items-center justify-between">
            <h2 className="font-black text-secondary text-lg">{t("admin.stationLines")}</h2>
            <button onClick={onAddLine} className="pill bg-primary text-secondary text-xs">
              <Plus className="w-3 h-3" strokeWidth={2.5} /> {t("admin.newLine")}
            </button>
          </header>
          <p className="text-xs font-bold text-muted-foreground mb-2">{t("admin.linesN", { n: lines.length })}</p>
          <ul className="space-y-3">
            {lines.map((l) => (
              <li key={l.id}>
                <Link to={`/admin/line/${stationId}/${l.id}`} className="flex items-center gap-3 rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform">
                  <span aria-hidden className="w-3 h-12 rounded-md border-2 border-secondary shrink-0" style={{ backgroundColor: l.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-secondary truncate">{l.destination}</p>
                    <p className="text-xs text-muted-foreground font-semibold">
                      {l.vehicle_type} · {lineStatusLabel(l.status)}{!l.is_published ? ` · ${t("common.draft")}` : ""}
                    </p>
                  </div>
                  <Chevron className="w-5 h-5 text-secondary shrink-0" strokeWidth={2.5} />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* ─── Tool catalog: grouped, searchable, persistent ─── */}
        <section className="space-y-4">
          <header className="flex items-center justify-between gap-3">
            <h2 className="font-black text-secondary text-lg">{t("admin.toolsTitle", "أدوات الإدارة")}</h2>
            <span className="text-xs font-bold text-muted-foreground">
              {t("admin.toolsCount", "{{n}} أداة", { n: visibleTools.length })}
            </span>
          </header>

          {/* Search reduces the cognitive load of "where is X?" without
              forcing the operator to learn our grouping. */}
          <div className="relative">
            <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("admin.searchTools", "ابحث في الأدوات…") as string}
              className="w-full h-11 rounded-lg border-2 border-secondary/30 bg-surface ps-10 pe-10 font-semibold text-sm text-secondary focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                aria-label={t("common.clear", "مسح") as string}
                className="absolute top-1/2 -translate-y-1/2 end-2 p-1 rounded text-muted-foreground hover:text-secondary"
              >
                <X className="w-4 h-4" strokeWidth={2.5} />
              </button>
            )}
          </div>

          {visibleTools.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-secondary/30 bg-surface p-6 text-center text-sm font-semibold text-muted-foreground">
              {t("admin.noToolsMatch", "لا توجد أدوات تطابق بحثك")}
            </div>
          )}

          {GROUPS.map((group) => {
            const tools = visibleTools.filter((tl) => tl.group === group.key);
            if (tools.length === 0) return null;
            const open = isSearching ? matchedGroups.has(group.key) : openState[group.key];

            return (
              <ToolGroup
                key={group.key}
                title={t(group.titleKey, group.titleFallback) as string}
                count={tools.length}
                open={open}
                forcedOpen={isSearching}
                onToggle={() => toggleGroup(group.key)}
              >
                {tools.map((tl) => {
                  const locked = !!tl.feature && !!currentTenant && !ent.isLoading && !ent.hasFeature(tl.feature);
                  return (
                    <Quick
                      key={tl.key}
                      to={tl.to({ stationId })}
                      icon={tl.icon}
                      title={t(tl.titleKey, tl.titleFallback) as string}
                      desc={t(tl.descKey, tl.descFallback) as string}
                      highlight={tl.highlight}
                      Chevron={Chevron}
                      locked={locked}
                    />
                  );
                })}
              </ToolGroup>
            );
          })}
        </section>
      </div>
    </div>
  );
};

// ─── Collapsible group with sticky header ────────────────────────────────────
const ToolGroup = ({
  title, count, open, forcedOpen, onToggle, children,
}: {
  title: string;
  count: number;
  open: boolean;
  forcedOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) => {
  const ToggleIcon = open ? ChevronUp : ChevronDown;
  return (
    <div className="space-y-2">
      <button
        onClick={onToggle}
        disabled={forcedOpen}
        aria-expanded={open}
        className="w-full flex items-center justify-between rounded-xl border-2 border-secondary/30 bg-surface-alt px-4 py-3 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform disabled:opacity-100 disabled:cursor-default"
      >
        <span className="flex items-center gap-2">
          <span className="font-black text-secondary text-sm">{title}</span>
          <span className="pill bg-secondary text-secondary-foreground text-[10px]">{count}</span>
        </span>
        {!forcedOpen && <ToggleIcon className="w-5 h-5 text-secondary" strokeWidth={2.5} />}
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-3 animate-in fade-in slide-in-from-top-1 duration-150">
          {children}
        </div>
      )}
    </div>
  );
};

const Quick = ({ to, icon, title, desc, highlight, Chevron, locked = false }: { to: string; icon: React.ReactNode; title: string; desc: string; highlight?: boolean; Chevron: typeof ChevronLeft; locked?: boolean }) => {
  const body = (
    <>
      <span className="text-secondary">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-black text-secondary truncate">{title}</p>
          {locked && <span className="pill bg-secondary text-secondary-foreground text-[10px]">Premium</span>}
        </div>
        <p className="text-xs text-muted-foreground font-semibold">{desc}</p>
      </div>
      <Chevron className="w-5 h-5 text-secondary shrink-0" strokeWidth={2.5} />
    </>
  );
  if (locked) {
    // Locked tools deep-link to billing rather than the tool itself, so the
    // operator immediately understands what unlocks it. The deep-link of the
    // underlying route still works for users who paste the URL directly.
    return <Link to="/admin/billing" className="flex items-center gap-3 rounded-xl border-2 border-secondary p-4 shadow-tactile-sm bg-surface opacity-90">{body}</Link>;
  }
  return <Link to={to} className={`flex items-center gap-3 rounded-xl border-2 border-secondary p-4 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform ${highlight ? "bg-primary" : "bg-surface"}`}>{body}</Link>;
};

export default AdminDashboard;
