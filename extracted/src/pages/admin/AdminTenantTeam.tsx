import { useEffect, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { useTenant } from "@/modules/tenancy/TenantContext";
import {
  changeTenantMemberRole,
  inviteTenantMember,
  listCurrentTenantInvites,
  listCurrentTenantMembers,
  removeTenantMember,
  revokeTenantInvite,
  type TenantInvite,
  type TenantMember,
} from "@/modules/shared/services/tenants";
import type { TenantRole } from "@/modules/shared/types";
import { Building2, Loader2, MailPlus, Trash2, Users, XCircle } from "lucide-react";
import { toast } from "sonner";

const MANAGEABLE_ROLES: TenantRole[] = ["tenant_admin", "ops_manager", "station_manager", "line_supervisor", "viewer"];

export default function AdminTenantTeam() {
  const { currentTenant, currentTenantRole } = useTenant();
  const [rows, setRows] = useState<TenantMember[]>([]);
  const [invites, setInvites] = useState<TenantInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TenantRole>("viewer");
  const canManage = ["tenant_owner", "tenant_admin"].includes(currentTenantRole ?? "");

  async function reload() {
    setLoading(true);
    try {
      const [members, pendingInvites] = await Promise.all([
        listCurrentTenantMembers(),
        canManage ? listCurrentTenantInvites() : Promise.resolve([]),
      ]);
      setRows(members);
      setInvites(pendingInvites);
    } catch (err: any) {
      toast.error(err?.message ?? "تعذر تحميل بيانات الجهة الحالية");
      setRows([]);
      setInvites([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!currentTenant) return;
    void reload();
  }, [currentTenant?.id, canManage]);

  async function onInvite() {
    if (!email.trim()) return toast.error("اكتب البريد الإلكتروني أولًا");
    try {
      const invite = await inviteTenantMember({ email, role });
      toast.success(`تمت الدعوة. الرمز: ${invite.token}`);
      setEmail("");
      await reload();
    } catch (err: any) {
      toast.error(err?.message ?? "تعذر إرسال الدعوة");
    }
  }

  async function onRevokeInvite(inviteId: string) {
    if (!confirm("إلغاء هذه الدعوة؟")) return;
    try {
      await revokeTenantInvite(inviteId);
      toast.success("تم إلغاء الدعوة");
      await reload();
    } catch (err: any) {
      toast.error(err?.message ?? "تعذر إلغاء الدعوة");
    }
  }

  async function onChangeRole(userId: string, nextRole: TenantRole) {
    try {
      await changeTenantMemberRole(userId, nextRole);
      toast.success("تم تحديث الدور");
      await reload();
    } catch (err: any) {
      toast.error(err?.message ?? "تعذر تحديث الدور");
    }
  }

  async function onRemove(userId: string) {
    if (!confirm("إزالة العضو من الجهة الحالية؟")) return;
    try {
      await removeTenantMember(userId);
      toast.success("تمت إزالة العضو");
      await reload();
    } catch (err: any) {
      toast.error(err?.message ?? "تعذر إزالة العضو");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar title="فريق الجهة" backTo="/admin" />
      <div className="px-5 pt-5 pb-10 space-y-4">
        <div className="rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm">
          <p className="font-black text-secondary text-lg">{currentTenant?.name ?? "لا توجد جهة حالية"}</p>
          <p className="text-sm font-semibold text-muted-foreground mt-1">إدارة أعضاء الجهة والدعوات.</p>
        </div>

        {canManage && (
          <div className="rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm space-y-3">
            <div className="flex items-center gap-2 text-secondary font-black"><MailPlus className="w-4 h-4" /> دعوة عضو</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="input-admin"
              dir="ltr"
            />
            <select value={role} onChange={(e) => setRole(e.target.value as TenantRole)} className="input-admin">
              {MANAGEABLE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button onClick={onInvite} className="btn-primary w-full">إرسال الدعوة</button>
          </div>
        )}

        {canManage && (
          <div className="rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm">
            <div className="flex items-center gap-2 text-secondary font-black mb-3"><MailPlus className="w-4 h-4" /> الدعوات المعلقة</div>
            {!currentTenant ? (
              <p className="text-sm font-semibold text-muted-foreground">اختر جهة أولًا.</p>
            ) : loading ? (
              <div className="grid place-items-center py-6"><Loader2 className="w-5 h-5 animate-spin text-secondary" /></div>
            ) : invites.length === 0 ? (
              <p className="text-sm font-semibold text-muted-foreground">لا توجد دعوات معلقة.</p>
            ) : (
              <div className="space-y-3">
                {invites.map((invite) => (
                  <div key={invite.id} className="rounded-lg border-2 border-secondary/20 bg-surface-alt p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-secondary" dir="ltr">{invite.email}</p>
                        <p className="text-xs font-semibold text-muted-foreground">{invite.role} · ينتهي {new Date(invite.expiresAt).toLocaleString("ar-EG")}</p>
                      </div>
                      <button onClick={() => onRevokeInvite(invite.id)} className="pill bg-destructive text-destructive-foreground text-xs">
                        <XCircle className="w-3 h-3" /> إلغاء
                      </button>
                    </div>
                    <p className="text-[11px] font-mono text-muted-foreground break-all" dir="ltr">{invite.token}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm">
          <div className="flex items-center gap-2 text-secondary font-black mb-3"><Users className="w-4 h-4" /> أعضاء الجهة</div>
          {!currentTenant ? (
            <div className="rounded-lg border-2 border-secondary/20 bg-surface-alt p-4 space-y-3">
              <p className="text-sm font-semibold text-muted-foreground">لا توجد جهة حالية بعد. أنشئ جهة أو انضم عبر دعوة أولًا.</p>
              <a href="/tenant/setup" className="btn-primary w-full">
                <Building2 className="w-4 h-4" /> إعداد الجهة
              </a>
            </div>
          ) : loading ? (
            <div className="grid place-items-center py-10"><Loader2 className="w-6 h-6 animate-spin text-secondary" /></div>
          ) : rows.length === 0 ? (
            <p className="text-sm font-semibold text-muted-foreground">لا يوجد أعضاء حتى الآن.</p>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => (
                <div key={row.id} className="rounded-lg border-2 border-secondary/20 bg-surface-alt p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-black text-secondary">{row.displayName || row.email}</p>
                      <p className="text-xs font-semibold text-muted-foreground" dir="ltr">{row.email}</p>
                    </div>
                    {canManage && (
                      <button onClick={() => onRemove(row.id)} className="pill bg-destructive text-destructive-foreground text-xs">
                        <Trash2 className="w-3 h-3" /> إزالة
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {canManage ? (
                      <select value={row.tenantRole} onChange={(e) => onChangeRole(row.id, e.target.value as TenantRole)} className="input-admin">
                        {["tenant_owner", ...MANAGEABLE_ROLES].map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    ) : (
                      <span className="pill text-xs bg-secondary text-secondary-foreground">{row.tenantRole}</span>
                    )}
                    {row.platformRoles.length > 0 && <span className="text-xs text-muted-foreground">منصة: {row.platformRoles.join(", ")}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
