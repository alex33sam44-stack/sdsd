import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Crown, Loader2, Lock, ShieldAlert } from 'lucide-react';
import type { BillingFeatureKey } from '@/modules/shared/types';
import { featureMeta } from './features';
import { useTenantEntitlements } from './useEntitlements';

export function EntitlementGuard({ feature, children }: { feature: BillingFeatureKey; children: ReactNode }) {
  const { currentTenant, isLoading, isError, hasFeature, currentPlanName } = useTenantEntitlements();
  const meta = featureMeta(feature);

  if (!currentTenant) {
    return (
      <div className="min-h-screen grid place-items-center px-6 text-center">
        <div className="max-w-md rounded-2xl border-2 border-secondary bg-surface p-6 shadow-tactile-sm space-y-3">
          <ShieldAlert className="w-8 h-8 mx-auto text-secondary" />
          <p className="text-xl font-black text-secondary">اختر جهة تشغيل أولًا</p>
          <p className="text-sm font-semibold text-muted-foreground">يجب تحديد الجهة الحالية قبل فتح الصفحات المقيّدة بالخطة.</p>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <Link to="/admin" className="btn-secondary">لوحة الإدارة</Link>
            <Link to="/platform" className="btn-primary">لوحة المنصة</Link>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="w-8 h-8 animate-spin text-secondary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen grid place-items-center px-6 text-center">
        <div className="max-w-md rounded-2xl border-2 border-secondary bg-surface p-6 shadow-tactile-sm space-y-3">
          <ShieldAlert className="w-8 h-8 mx-auto text-secondary" />
          <p className="text-xl font-black text-secondary">تعذر التحقق من صلاحية الخطة</p>
          <p className="text-sm font-semibold text-muted-foreground">تحقق من الاتصال أو أعد تحميل الصفحة ثم حاول مرة أخرى.</p>
          <Link to="/admin/billing" className="btn-primary">فتح الفوترة</Link>
        </div>
      </div>
    );
  }

  if (!hasFeature(feature)) {
    return (
      <div className="min-h-screen bg-background px-5 py-8">
        <div className="mx-auto max-w-2xl rounded-2xl border-2 border-secondary bg-surface p-6 shadow-tactile-sm space-y-4 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/15 border-2 border-secondary grid place-items-center">
            <Lock className="w-7 h-7 text-secondary" />
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-black text-secondary">الميزة غير متاحة ضمن خطتك الحالية</p>
            <p className="text-sm font-semibold text-muted-foreground">{meta.label}</p>
            <p className="text-sm font-semibold text-muted-foreground">{meta.description}</p>
          </div>
          <div className="rounded-xl border-2 border-secondary/20 bg-surface-alt p-4 text-start space-y-1">
            <p className="text-xs font-bold text-muted-foreground">الخطة الحالية</p>
            <p className="font-black text-secondary">{currentPlanName ?? 'غير محددة'}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <Link to="/admin/billing" className="btn-primary inline-flex items-center gap-2"><Crown className="w-4 h-4" /> ترقية الخطة</Link>
            <Link to="/admin" className="btn-secondary">العودة للوحة الإدارة</Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
