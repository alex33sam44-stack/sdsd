import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TopBar } from "@/components/TopBar";
import { api } from "@/lib/api";
import { grantRole, revokeRole } from "@/modules/shared/services/roles";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Wrench, User as UserIcon } from "lucide-react";
import type { AppRole, PlatformRole } from "@/modules/shared/types";

const MANAGED_PLATFORM_ROLES: PlatformRole[] = [
  "platform_owner",
  "platform_admin",
  "support_agent",
];

const ROLE_LABEL_KEY: Record<PlatformRole, string> = {
  platform_owner: "admin.usersPage.role.platform_owner",
  platform_admin: "admin.usersPage.role.platform_admin",
  support_agent: "admin.usersPage.role.support_agent",
};

type Row = { id: string; display_name: string | null; roles: AppRole[] };

const AdminUsers = () => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      const users = await api.get<Array<{ id: string; displayName: string | null; roles: AppRole[] }>>("/users");
      setRows(
        (users ?? []).map((u) => ({
          id: u.id,
          display_name: u.displayName ?? null,
          roles: (u.roles ?? []) as AppRole[],
        })),
      );
    } catch {
      setRows([]);
    }
    setLoading(false);
  };
  useEffect(() => {
    void reload();
  }, []);

  const toggleRole = async (userId: string, role: PlatformRole, on: boolean) => {
    try {
      if (on) {
        await grantRole(userId, role);
        toast.success(t("admin.usersPage.granted", { role: t(ROLE_LABEL_KEY[role]) }));
      } else {
        await revokeRole(userId, role);
        toast.success(t("admin.usersPage.revoked", { role: t(ROLE_LABEL_KEY[role]) }));
      }
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? t("admin.usersPage.updateFailed"));
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <TopBar title={t("admin.usersTitle")} backTo="/admin" />
      <div className="px-5 pt-5 pb-10 space-y-3">
        <div className="rounded-xl border-2 border-secondary bg-surface-alt p-3 text-xs font-semibold text-muted-foreground">
          تُدار أدوار العميل من صفحة فريق الجهة. هذه الصفحة مخصّصة فقط للأدوار العامة على مستوى المنصة.
        </div>
        {loading ? (
          <div className="grid place-items-center py-10"><Loader2 className="w-6 h-6 animate-spin text-secondary" /></div>
        ) : rows.length === 0 ? (
          <div className="card-tactile bg-surface-alt"><p className="font-black text-secondary">{t("admin.usersPage.noUsers")}</p></div>
        ) : rows.map((u) => {
          const hasPassenger = u.roles.includes("passenger");
          return (
            <div key={u.id} className="rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm">
              <div className="flex items-center gap-2 mb-3">
                <UserIcon className="w-4 h-4 text-secondary" strokeWidth={2.5} />
                <p className="font-black text-secondary truncate flex-1">{u.display_name || t("admin.usersPage.noName")}</p>
                <span className="text-[10px] text-muted-foreground font-mono" dir="ltr">{u.id.slice(0, 8)}…</span>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                {hasPassenger && (
                  <span className="pill text-xs bg-surface-alt text-secondary border-secondary">
                    <UserIcon className="w-3 h-3" strokeWidth={2.5} />
                    {t("admin.usersPage.role.passenger")}
                  </span>
                )}
                {MANAGED_PLATFORM_ROLES.map((r) => {
                  const has = u.roles.includes(r);
                  return (
                    <button
                      key={r}
                      onClick={() => void toggleRole(u.id, r, !has)}
                      className={`pill text-xs ${has ? (r === "platform_admin" || r === "platform_owner" ? "bg-primary text-primary-foreground" : "bg-success text-success-foreground") : "bg-surface-alt text-secondary"}`}
                    >
                      {r === "support_agent" ? <Wrench className="w-3 h-3" strokeWidth={2.5} /> : <ShieldCheck className="w-3 h-3" strokeWidth={2.5} />}
                      {t(ROLE_LABEL_KEY[r], r)}{has ? " ✓" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminUsers;
