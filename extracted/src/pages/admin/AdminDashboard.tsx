import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TopBar } from "@/components/TopBar";
import { isRtl } from "@/i18n";
import { BarChart3, Building2, ChevronLeft, ChevronRight, CreditCard, FileEdit, FileWarning, Globe2, History, Lightbulb, Map, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
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

        <section className="grid grid-cols-1 gap-3">
          <Quick to={`/admin/layout/${stationId}`} icon={<Map className="w-5 h-5" />} title={t("admin.layoutEditor")} desc={t("admin.layoutEditorDesc")} highlight Chevron={Chevron} />
          <Quick to="/admin/drafts" icon={<FileEdit className="w-5 h-5" />} title={t("admin.drafts")} desc={t("admin.draftsDesc")} Chevron={Chevron} />
          <Quick to="/admin/review" icon={<ShieldCheck className="w-5 h-5" />} title={t("admin.review")} desc={t("admin.reviewDesc")} Chevron={Chevron} />
          <Quick to="/admin/validation" icon={<FileWarning className="w-5 h-5" />} title={t("admin.validation")} desc={t("admin.validationDesc")} Chevron={Chevron} />
          <Quick to="/admin/suggestions" icon={<Lightbulb className="w-5 h-5" />} title={t("admin.suggestions", "اقتراحات المشغّل")} desc={t("admin.suggestionsDesc", "اقتراحات تشغيلية مبنية على بيانات حقيقية")} Chevron={Chevron} locked={!!currentTenant && !ent.isLoading && !ent.hasFeature('suggestions')} />
          <Quick to="/admin/analytics" icon={<BarChart3 className="w-5 h-5" />} title={t("admin.analytics", "تقارير وتحليلات")} desc={t("admin.analyticsDesc", "الطلب، التوفر، الحداثة، والمشاكل")} Chevron={Chevron} locked={!!currentTenant && !ent.isLoading && !ent.hasFeature('analytics')} />
          <Quick to="/admin/audit" icon={<History className="w-5 h-5" />} title={t("admin.audit")} desc={t("admin.auditDesc")} Chevron={Chevron} />
          <Quick to="/admin/tools" icon={<ShieldCheck className="w-5 h-5" />} title={t("admin.importExport")} desc={t("admin.importExportDesc")} Chevron={Chevron} locked={!!currentTenant && !ent.isLoading && !ent.hasFeature('import_export')} />
          <Quick to="/admin/interop" icon={<Globe2 className="w-5 h-5" />} title={t("admin.interop", "الجاهزية للبيانات المفتوحة")} desc={t("admin.interopDesc", "تصدير GTFS-like + فحوصات الجاهزية")} Chevron={Chevron} locked={!!currentTenant && !ent.isLoading && !ent.hasFeature('interoperability')} />
          <Quick to="/admin/team" icon={<Users className="w-5 h-5" />} title="فريق الجهة" desc="دعوة الأعضاء وإدارة أدوارهم داخل الجهة الحالية" Chevron={Chevron} locked={!!currentTenant && !ent.isLoading && !ent.hasFeature('team_management')} />
          <Quick to="/admin/billing" icon={<CreditCard className="w-5 h-5" />} title="الخطط والفوترة" desc="الخطة الحالية، الحدود، واستهلاك الجهة" Chevron={Chevron} />
          {isAdmin && <Quick to="/admin/users" icon={<Users className="w-5 h-5" />} title={t("admin.users")} desc={t("admin.usersDesc")} Chevron={Chevron} />}
        </section>
      </div>
    </div>
  );
};

const Quick = ({ to, icon, title, desc, highlight, Chevron, locked = false }: { to: string; icon: React.ReactNode; title: string; desc: string; highlight?: boolean; Chevron: typeof ChevronLeft; locked?: boolean }) => {
  const body = (
    <>
      <span className="text-secondary">{icon}</span>
      <div className="flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-black text-secondary">{title}</p>
          {locked && <span className="pill bg-secondary text-secondary-foreground text-[10px]">Premium</span>}
        </div>
        <p className="text-xs text-muted-foreground font-semibold">{desc}</p>
      </div>
      <Chevron className="w-5 h-5 text-secondary" strokeWidth={2.5} />
    </>
  );
  if (locked) {
    return <Link to="/admin/billing" className="flex items-center gap-3 rounded-xl border-2 border-secondary p-4 shadow-tactile-sm bg-surface opacity-90">{body}</Link>;
  }
  return <Link to={to} className={`flex items-center gap-3 rounded-xl border-2 border-secondary p-4 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform ${highlight ? "bg-primary" : "bg-surface"}`}>{body}</Link>;
};

export default AdminDashboard;
