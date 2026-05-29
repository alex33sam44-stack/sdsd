import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TopBar } from "@/components/TopBar";
import { useAuth } from "@/modules/auth/useAuth";
import { authApi } from "@/lib/api";
import { Layers, LogOut, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { LiveOpsPanel } from "./LiveOpsPanel";
import { useTenant } from "@/modules/tenancy/TenantContext";

const OpsDashboard = () => {
  const { user, platformRoles, currentTenantRole } = useAuth();
  const { currentTenant } = useTenant();
  const { t } = useTranslation();
  const isAdmin = platformRoles.includes("platform_admin") || platformRoles.includes("platform_owner");

  const logout = async () => {
    await authApi.logout();
    toast.success(t("auth.signedOut"));
  };

  const roleLabel = (r: string) =>
    r === "platform_admin"
      ? t("ops.rolePlatformAdmin")
      : r === "platform_owner"
        ? t("admin.usersPage.role.platform_owner", "مالك المنصة")
        : r === "support_agent"
          ? t("admin.usersPage.role.support_agent", "دعم")
          : r;

  const tenantRoleLabel = currentTenantRole ?? null;

  return (
    <div className="min-h-screen bg-background">
      <TopBar title={t("ops.title")} backTo="/" />
      <div className="px-5 pt-5 pb-10 space-y-4">
        <div className="card-tactile bg-secondary text-secondary-foreground">
          <p className="font-black text-primary text-sm">{t("ops.welcome", { email: user?.email })}</p>
          <p className="text-sm font-semibold mt-1 text-secondary-foreground/90">
            {t("ops.intro")}
          </p>
          {currentTenant && (
            <p className="text-xs font-bold mt-2 text-secondary-foreground/80">الجهة الحالية: {currentTenant.name}</p>
          )}
          <div className="flex gap-2 mt-2 flex-wrap">
            {tenantRoleLabel && (
              <span className="pill bg-primary !text-secondary text-xs">{tenantRoleLabel}</span>
            )}
            {platformRoles.map((r) => (
              <span key={r} className="pill bg-primary !text-secondary text-xs">
                {roleLabel(r)}
              </span>
            ))}
            {!tenantRoleLabel && platformRoles.length === 0 && (
              <span className="pill bg-primary !text-secondary text-xs">{t("ops.rolePassenger")}</span>
            )}
          </div>
        </div>

        <LiveOpsPanel />

        <DashCard to="/admin" icon={<Layers className="w-5 h-5" />} title={t("ops.linesAndLayout")} desc={t("ops.linesAndLayoutDesc")} />
        <DashCard to="/admin/tools" icon={<ShieldCheck className="w-5 h-5" />} title={t("ops.validationTools")} desc={t("ops.validationToolsDesc")} />
        {isAdmin && (
          <DashCard to="/platform" icon={<Users className="w-5 h-5" />} title={t("ops.platformAdmin")} desc={t("ops.platformAdminDesc")} highlight />
        )}

        <button
          onClick={logout}
          className="w-full h-12 rounded-lg border-2 border-secondary bg-surface text-secondary font-black flex items-center justify-center gap-2 mt-2"
        >
          <LogOut className="w-4 h-4" strokeWidth={2.5} />
          {t("common.logout")}
        </button>
      </div>
    </div>
  );
};

const DashCard = ({
  to, icon, title, desc, highlight,
}: { to: string; icon: React.ReactNode; title: string; desc: string; highlight?: boolean }) => (
  <Link
    to={to}
    className={`flex items-center gap-3 rounded-xl border-2 border-secondary p-4 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform ${
      highlight ? "bg-primary" : "bg-surface"
    }`}
  >
    <span className="text-secondary">{icon}</span>
    <div className="flex-1">
      <p className="font-black text-secondary">{title}</p>
      <p className="text-xs text-muted-foreground font-semibold">{desc}</p>
    </div>
  </Link>
);

export default OpsDashboard;
