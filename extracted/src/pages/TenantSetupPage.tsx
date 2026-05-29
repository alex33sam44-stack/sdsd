import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Loader2, PlusCircle, ShieldCheck, Users } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { useAuth } from "@/modules/auth/useAuth";
import { useTenant } from "@/modules/tenancy/TenantContext";
import { acceptTenantInvite, createTenant, listMyTenants } from "@/modules/shared/services/tenants";
import type { TenantMembership } from "@/modules/shared/types";
import { tenantStore } from "@/lib/api";
import { toast } from "sonner";

const PENDING_INVITE_KEY = "app.pendingInviteToken";

export default function TenantSetupPage() {
  const { user, loading } = useAuth();
  const { memberships, currentTenant, switchTenant } = useTenant();
  const [myTenants, setMyTenants] = useState<TenantMembership[]>(memberships);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const location = useLocation();
  const navigate = useNavigate();

  const inviteToken = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("invite") || sessionStorage.getItem(PENDING_INVITE_KEY);
  }, [location.search]);

  useEffect(() => {
    if (!memberships.length) {
      void listMyTenants().then(setMyTenants).catch(() => setMyTenants([]));
      return;
    }
    setMyTenants(memberships);
  }, [memberships]);

  useEffect(() => {
    if (!inviteToken || !user || inviteBusy) return;
    let cancelled = false;
    setInviteBusy(true);
    acceptTenantInvite(inviteToken)
      .then((tenant: any) => {
        if (cancelled) return;
        sessionStorage.removeItem(PENDING_INVITE_KEY);
        const slugToUse = tenant?.slug ?? tenant?.tenant?.slug ?? null;
        if (slugToUse) {
          tenantStore.set(slugToUse);
          switchTenant(slugToUse);
        }
        toast.success("تم قبول الدعوة والانضمام إلى الجهة بنجاح");
        navigate("/admin/team", { replace: true });
      })
      .catch((err: any) => {
        if (cancelled) return;
        toast.error(err?.message ?? "تعذر قبول الدعوة");
      })
      .finally(() => {
        if (!cancelled) setInviteBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inviteToken, user?.id]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-secondary" />
      </div>
    );
  }

  if (!user) {
    const next = `/tenant/setup${location.search}`;
    return <Navigate to="/auth" state={{ from: next }} replace />;
  }

  const onCreateTenant = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("اكتب اسم الجهة أولًا");
    setCreateBusy(true);
    try {
      const tenant = await createTenant({ name: name.trim(), slug: slug.trim() || undefined });
      tenantStore.set(tenant.slug);
      switchTenant(tenant.slug);
      sessionStorage.removeItem(PENDING_INVITE_KEY);
      toast.success("تم إنشاء الجهة وتعيينك كمالك لها");
      navigate("/admin/team", { replace: true });
    } catch (err: any) {
      toast.error(err?.message ?? "تعذر إنشاء الجهة");
    } finally {
      setCreateBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <TopBar title="إعداد الجهة" backTo={currentTenant ? "/settings" : "/"} />
      <div className="px-5 pt-5 pb-10 space-y-5">
        {inviteToken && (
          <div className="rounded-xl border-2 border-secondary bg-primary p-4 shadow-tactile-sm">
            <div className="flex items-center gap-2 text-secondary font-black">
              <ShieldCheck className="w-5 h-5" />
              دعوة للانضمام إلى جهة
            </div>
            <p className="text-sm font-semibold text-secondary/80 mt-2">
              سيتم قبول الدعوة تلقائيًا بعد التحقق من حسابك. يمكنك أيضًا إنشاء جهة جديدة إذا لم تكن هذه الدعوة تخصك.
            </p>
            {inviteBusy && <p className="text-xs font-bold text-secondary mt-3">جارٍ قبول الدعوة…</p>}
          </div>
        )}

        <section className="rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm space-y-3">
          <div className="flex items-center gap-2 text-secondary font-black text-lg">
            <PlusCircle className="w-5 h-5" />
            أنشئ جهتك الأولى
          </div>
          <p className="text-sm font-semibold text-muted-foreground">
            هذه الخطوة تنشئ عميلًا مستقلًا داخل المنصة، وتجعلك مالك الجهة الحالية.
          </p>
          <form onSubmit={onCreateTenant} className="space-y-3">
            <div>
              <label className="block text-sm font-bold text-secondary mb-1.5">اسم الجهة</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="input-admin" placeholder="مثال: هيئة نقل القاهرة" />
            </div>
            <div>
              <label className="block text-sm font-bold text-secondary mb-1.5">Slug اختياري</label>
              <input value={slug} onChange={(e) => setSlug(e.target.value)} className="input-admin" dir="ltr" placeholder="cairo-ops" />
            </div>
            <button disabled={createBusy} type="submit" className="btn-primary w-full">
              {createBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
              إنشاء الجهة
            </button>
          </form>
        </section>

        <section className="rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm space-y-3">
          <div className="flex items-center gap-2 text-secondary font-black text-lg">
            <Users className="w-5 h-5" />
            الجهات التي أنتمي إليها
          </div>
          {myTenants.length === 0 ? (
            <p className="text-sm font-semibold text-muted-foreground">لا توجد جهات مرتبطة بحسابك حتى الآن.</p>
          ) : (
            <div className="space-y-2">
              {myTenants.map((membership) => {
                const active = currentTenant?.id === membership.tenant_id;
                return (
                  <div key={`${membership.tenant_id}-${membership.role}`} className="rounded-lg border-2 border-secondary/20 bg-surface-alt p-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-black text-secondary">{membership.tenant_name}</p>
                      <p className="text-xs font-semibold text-muted-foreground">{membership.role} · {membership.tenant_status}</p>
                    </div>
                    <button
                      onClick={() => {
                        tenantStore.set(membership.tenant_slug);
                        switchTenant(membership.tenant_slug);
                        navigate("/admin", { replace: true });
                      }}
                      className={`pill text-xs ${active ? "bg-secondary text-secondary-foreground" : "bg-primary text-secondary"}`}
                    >
                      {active ? "الحالية" : "الدخول إليها"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <Link to="/settings" className="block text-center text-xs font-bold text-muted-foreground underline pt-1">
            العودة إلى الإعدادات
          </Link>
        </section>
      </div>
    </div>
  );
}
