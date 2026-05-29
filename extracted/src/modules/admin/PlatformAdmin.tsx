import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TopBar } from "@/components/TopBar";
import { api, tenantStore } from "@/lib/api";
import { adminListAllStations } from "@/modules/shared/services/stations";
import { grantRole as grantRoleApi, revokeRole as revokeRoleApi } from "@/modules/shared/services/roles";
import { createTenant, listTenantsAdmin, setTenantStatus } from "@/modules/shared/services/tenants";
import { useTenant } from "@/modules/tenancy/TenantContext";
import { toast } from "sonner";
import { Activity, Building2, Loader2, MapPin, Bus, PlusCircle, ShieldCheck, Users, Wrench, User as UserIcon } from "lucide-react";
import type { AppRole, PlatformRole, TenantSummary } from "@/modules/shared/types";

type Stats = {
  stations: number;
  lines: number;
  publishedLines: number;
  users: number;
  searches7d: number;
};

const MANAGED_PLATFORM_ROLES: PlatformRole[] = ["platform_owner", "platform_admin", "support_agent"];

const PlatformAdmin = () => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<Array<{ id: string; display_name: string | null; roles: AppRole[] }>>([]);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTenantName, setNewTenantName] = useState("");
  const [newTenantSlug, setNewTenantSlug] = useState("");
  const [creatingTenant, setCreatingTenant] = useState(false);
  const { currentTenant } = useTenant();

  async function reload() {
    setLoading(true);
    try {
      const [stations, allLines, usersResp, tenantsResp] = await Promise.all([
        adminListAllStations().catch(() => []),
        api.get<any[]>("/lines").catch(() => []),
        api.get<Array<{ id: string; displayName: string | null; roles: AppRole[] }>>("/users").catch(() => []),
        listTenantsAdmin().catch(() => []),
      ]);
      const linesArr = (allLines ?? []) as any[];
      const published = linesArr.filter((l) => l.isPublished ?? l.is_published).length;
      setStats({
        stations: stations.length,
        lines: linesArr.length,
        publishedLines: published,
        users: usersResp.length,
        searches7d: 0,
      });
      setUsers(
        (usersResp ?? []).map((u) => ({
          id: u.id,
          display_name: u.displayName ?? null,
          roles: (u.roles ?? []) as AppRole[],
        })),
      );
      setTenants(tenantsResp ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? t("admin.platform.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [t]);

  const grantRole = async (userId: string, role: PlatformRole) => {
    try {
      await grantRoleApi(userId, role);
      toast.success(t("admin.platform.roleGranted"));
      setUsers((u) => u.map((x) => (x.id === userId ? { ...x, roles: [...new Set([...x.roles, role])] } : x)));
    } catch (e: any) {
      toast.error(e?.message ?? t("admin.platform.loadFailed"));
    }
  };

  const revokeRole = async (userId: string, role: PlatformRole) => {
    try {
      await revokeRoleApi(userId, role);
      toast.success(t("admin.platform.roleRevoked"));
      setUsers((u) => u.map((x) => (x.id === userId ? { ...x, roles: x.roles.filter((r) => r !== role) } : x)));
    } catch (e: any) {
      toast.error(e?.message ?? t("admin.platform.loadFailed"));
    }
  };

  const roleShort = (r: PlatformRole) =>
    r === "platform_admin"
      ? t("admin.usersPage.role.adminShort")
      : r === "platform_owner"
        ? "Owner"
        : "Support";

  const tenantCounts = useMemo(
    () => ({
      active: tenants.filter((tenant) => tenant.status === "active").length,
      suspended: tenants.filter((tenant) => tenant.status === "suspended").length,
      archived: tenants.filter((tenant) => tenant.status === "archived").length,
    }),
    [tenants],
  );

  const onCreateTenant = async () => {
    if (!newTenantName.trim()) return toast.error("اكتب اسم الجهة أولًا");
    setCreatingTenant(true);
    try {
      const tenant = await createTenant({ name: newTenantName.trim(), slug: newTenantSlug.trim() || undefined });
      tenantStore.set(tenant.slug);
      toast.success("تم إنشاء الجهة الجديدة بنجاح");
      setNewTenantName("");
      setNewTenantSlug("");
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذر إنشاء الجهة");
    } finally {
      setCreatingTenant(false);
    }
  };

  const onSetTenantStatus = async (tenantId: string, status: TenantSummary["status"]) => {
    try {
      await setTenantStatus(tenantId, status);
      toast.success("تم تحديث حالة الجهة");
      setTenants((rows) => rows.map((row) => (row.id === tenantId ? { ...row, status } : row)));
    } catch (e: any) {
      toast.error(e?.message ?? "تعذر تحديث حالة الجهة");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <TopBar title={t("admin.platformAdminTitle")} backTo="/ops" />
      <div className="px-5 pt-5 pb-10 space-y-5">
        {loading ? (
          <div className="grid place-items-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-secondary" />
          </div>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3">
              <Stat icon={<MapPin className="w-4 h-4" />} label={t("admin.platform.stations")} value={stats?.stations ?? 0} />
              <Stat icon={<Bus className="w-4 h-4" />} label={t("admin.platform.publishedLines")} value={`${stats?.publishedLines}/${stats?.lines}`} />
              <Stat icon={<Users className="w-4 h-4" />} label={t("admin.platform.users")} value={stats?.users ?? 0} />
              <Stat icon={<Activity className="w-4 h-4" />} label={t("admin.platform.search7d")} value={stats?.searches7d ?? 0} />
            </section>

            <section className="rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm space-y-3">
              <div className="flex items-center gap-2 text-secondary font-black text-lg">
                <Building2 className="w-5 h-5" />
                الجِهات والعملاء
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <MiniStat label="نشطة" value={tenantCounts.active} />
                <MiniStat label="معلقة" value={tenantCounts.suspended} />
                <MiniStat label="مؤرشفة" value={tenantCounts.archived} />
              </div>
              <div className="rounded-lg border-2 border-secondary/20 bg-surface-alt p-3 space-y-2">
                <p className="text-sm font-black text-secondary">إنشاء جهة جديدة</p>
                <input value={newTenantName} onChange={(e) => setNewTenantName(e.target.value)} className="input-admin" placeholder="اسم الجهة" />
                <input value={newTenantSlug} onChange={(e) => setNewTenantSlug(e.target.value)} className="input-admin" dir="ltr" placeholder="slug اختياري" />
                <button onClick={onCreateTenant} disabled={creatingTenant} className="btn-primary w-full">
                  {creatingTenant ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
                  إنشاء جهة
                </button>
              </div>
              <div className="space-y-2">
                {tenants.length === 0 ? (
                  <p className="text-sm font-semibold text-muted-foreground">لا توجد جهات بعد.</p>
                ) : tenants.map((tenant) => (
                  <div key={tenant.id} className="rounded-lg border-2 border-secondary/20 bg-surface-alt p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-secondary">{tenant.name}</p>
                        <p className="text-xs font-semibold text-muted-foreground" dir="ltr">{tenant.slug}</p>
                      </div>
                      <span className="pill bg-secondary text-secondary-foreground text-xs">{tenant.status}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => tenantStore.set(tenant.slug)} className={`pill text-xs ${currentTenant?.id === tenant.id ? "bg-secondary text-secondary-foreground" : "bg-primary text-secondary"}`}>
                        {currentTenant?.id === tenant.id ? "الجهة الحالية" : "العمل داخلها"}
                      </button>
                      <button onClick={() => onSetTenantStatus(tenant.id, "active")} className="pill text-xs bg-primary text-secondary">تفعيل</button>
                      <button onClick={() => onSetTenantStatus(tenant.id, "suspended")} className="pill text-xs bg-surface border-2 border-secondary text-secondary">تعليق</button>
                      <button onClick={() => onSetTenantStatus(tenant.id, "archived")} className="pill text-xs bg-destructive text-destructive-foreground">أرشفة</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm space-y-3">
              <div className="flex items-center gap-2 text-secondary font-black text-lg">
                <ShieldCheck className="w-5 h-5" />
                الخطط والفوترة
              </div>
              <p className="text-sm font-semibold text-muted-foreground">Foundation جاهز لإدارة الخطط والحدود واستهلاك الجهات من شاشة واحدة.</p>
              <a href="/admin/billing" className="btn-primary w-full">فتح إدارة الخطط والفوترة</a>
            </section>

            <section>
              <h2 className="font-black text-secondary text-lg mb-3">صلاحيات المنصة العامة</h2>
              <p className="text-xs font-semibold text-muted-foreground mb-3">
                أدوار العميل (tenant roles) تُدار من صفحة فريق الجهة. هذه القائمة مخصّصة للأدوار العامة على مستوى المنصة فقط.
              </p>
              <ul className="space-y-2">
                {users.length === 0 && (
                  <li className="text-sm font-semibold text-muted-foreground text-center py-4">
                    {t("admin.platform.noUsers")}
                  </li>
                )}
                {users.map((u) => {
                  const hasPassenger = u.roles.includes("passenger");
                  return (
                    <li key={u.id} className="rounded-xl border-2 border-secondary bg-surface p-3 shadow-tactile-sm">
                      <p className="font-black text-secondary truncate">{u.display_name ?? t("admin.platform.noName")}</p>
                      <p className="text-[11px] font-bold text-muted-foreground truncate" dir="ltr">{u.id}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2 items-center">
                        {hasPassenger && (
                          <span className="text-[11px] px-2 py-1 rounded-full border-2 border-secondary bg-surface-alt text-secondary font-bold inline-flex items-center gap-1">
                            <UserIcon className="w-3 h-3" strokeWidth={2.5} />
                            راكب
                          </span>
                        )}
                        {MANAGED_PLATFORM_ROLES.map((r) => {
                          const has = u.roles.includes(r);
                          return (
                            <button
                              key={r}
                              onClick={() => (has ? void revokeRole(u.id, r) : void grantRole(u.id, r))}
                              className={`text-[11px] px-2 py-1 rounded-full border-2 border-secondary font-bold inline-flex items-center gap-1 ${
                                has ? "bg-secondary text-secondary-foreground" : "bg-surface text-secondary"
                              }`}
                            >
                              {r === "support_agent" ? <Wrench className="w-3 h-3" strokeWidth={2.5} /> : <ShieldCheck className="w-3 h-3" strokeWidth={2.5} />}
                              {roleShort(r)}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <p className="text-[11px] text-muted-foreground font-semibold text-center">
              {t("admin.platform.moreSoon")}
            </p>
          </>
        )}
      </div>
    </div>
  );
};

const Stat = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) => (
  <div className="rounded-xl border-2 border-secondary bg-surface p-3 shadow-tactile-sm">
    <div className="flex items-center gap-1.5 text-secondary">{icon}<span className="text-xs font-bold">{label}</span></div>
    <p className="text-2xl font-black text-secondary mt-1 tabular">{value}</p>
  </div>
);

const MiniStat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-lg border-2 border-secondary/20 bg-surface-alt p-3">
    <p className="text-xs font-bold text-muted-foreground">{label}</p>
    <p className="text-xl font-black text-secondary mt-1">{value}</p>
  </div>
);

export default PlatformAdmin;
