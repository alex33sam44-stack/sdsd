import { useEffect, useMemo, useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { useTenant } from '@/modules/tenancy/TenantContext';
import { useAuth } from '@/modules/auth/useAuth';
import { tenantStore } from '@/lib/api';
import {
  getCurrentTenantBilling,
  listBillingAdminSummary,
  listBillingPlans,
  listBillingWebhookEvents,
  openBillingPortal,
  startBillingCheckout,
  updateCurrentTenantBillingProfile,
  updateCurrentTenantPlan,
} from '@/modules/shared/services/billing';
import type {
  BillingPlan,
  BillingProvider,
  BillingSummary,
  BillingWebhookEvent,
  TenantBillingOverview,
} from '@/modules/shared/types';
import { toast } from 'sonner';
import {
  BarChart3,
  Building2,
  CreditCard,
  ExternalLink,
  Loader2,
  ReceiptText,
  ShieldCheck,
  Users,
  Webhook,
} from 'lucide-react';

function money(plan: BillingPlan) {
  if (plan.monthly_price_minor == null && plan.yearly_price_minor == null) return 'حسب الاتفاق';
  const currency = plan.currency || 'USD';
  const monthly = plan.monthly_price_minor != null ? `${(plan.monthly_price_minor / 100).toFixed(0)} ${currency}/mo` : null;
  const yearly = plan.yearly_price_minor != null ? `${(plan.yearly_price_minor / 100).toFixed(0)} ${currency}/yr` : null;
  return [monthly, yearly].filter(Boolean).join(' · ');
}

function renderLimit(value: unknown) {
  if (value === null || value === undefined || value === '') return 'غير محدود';
  return String(value);
}

export default function AdminBilling() {
  const { currentTenant, currentTenantRole } = useTenant();
  const { platformRoles } = useAuth();
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [overview, setOverview] = useState<TenantBillingOverview | null>(null);
  const [summaries, setSummaries] = useState<BillingSummary[]>([]);
  const [webhooks, setWebhooks] = useState<BillingWebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [launchingCheckout, setLaunchingCheckout] = useState(false);
  const [launchingPortal, setLaunchingPortal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('starter');
  const [selectedProvider, setSelectedProvider] = useState<BillingProvider>('manual');
  const [selectedInterval, setSelectedInterval] = useState<'monthly' | 'yearly' | 'custom'>('monthly');
  const [seatLimit, setSeatLimit] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [billingName, setBillingName] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [taxId, setTaxId] = useState('');
  const isPlatform = platformRoles.includes('platform_admin') || platformRoles.includes('platform_owner');
  const canManageTenantBilling = isPlatform || ['tenant_owner', 'tenant_admin'].includes(currentTenantRole ?? '');

  async function reload() {
    setLoading(true);
    try {
      const [plansResp, overviewResp, summaryResp, webhooksResp] = await Promise.all([
        listBillingPlans().catch(() => []),
        currentTenant ? getCurrentTenantBilling().catch(() => null) : Promise.resolve(null),
        isPlatform ? listBillingAdminSummary().catch(() => []) : Promise.resolve([]),
        currentTenant ? listBillingWebhookEvents().catch(() => []) : Promise.resolve([]),
      ]);
      setPlans(plansResp);
      setOverview(overviewResp);
      setSummaries(summaryResp);
      setWebhooks(webhooksResp);
      if (overviewResp?.tenant_plan?.code) setSelectedPlan(overviewResp.tenant_plan.code);
      setSelectedProvider(overviewResp?.billing_profile?.provider ?? overviewResp?.subscription?.provider ?? 'manual');
      setSelectedInterval((overviewResp?.subscription?.interval as 'monthly' | 'yearly' | 'custom') ?? 'monthly');
      setSeatLimit(String(overviewResp?.tenant_plan?.seat_limit ?? overviewResp?.subscription?.seats ?? ''));
      setBillingEmail(overviewResp?.billing_profile?.billing_email ?? '');
      setBillingName(overviewResp?.billing_profile?.billing_name ?? '');
      setCountryCode(overviewResp?.billing_profile?.country_code ?? '');
      setTaxId(overviewResp?.billing_profile?.tax_id ?? '');
    } catch (err: any) {
      toast.error(err?.message ?? 'تعذر تحميل بيانات الخطة والفوترة');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [currentTenant?.id, isPlatform]);

  const selectedCatalog = useMemo(
    () => plans.find((plan) => plan.code === selectedPlan) ?? null,
    [plans, selectedPlan],
  );

  const providerOptions = overview?.provider_options ?? [];
  const currentProviderOption = providerOptions.find((option) => option.provider === selectedProvider);

  async function onSavePlan() {
    if (!selectedPlan) return toast.error('اختر الخطة أولًا');
    setSavingPlan(true);
    try {
      const seatLimitValue = seatLimit.trim() ? Number(seatLimit) : null;
      const next = await updateCurrentTenantPlan({
        code: selectedPlan,
        seat_limit: Number.isFinite(seatLimitValue as number) ? seatLimitValue : null,
        seats: Number.isFinite(seatLimitValue as number) ? Number(seatLimitValue) : undefined,
        interval: selectedInterval,
        status: overview?.subscription?.status,
      });
      setOverview(next);
      toast.success('تم تحديث الخطة الحالية');
    } catch (err: any) {
      toast.error(err?.message ?? 'تعذر تحديث الخطة');
    } finally {
      setSavingPlan(false);
    }
  }

  async function onSaveProfile() {
    setSavingProfile(true);
    try {
      const profile = await updateCurrentTenantBillingProfile({
        provider: selectedProvider,
        billing_email: billingEmail || null,
        billing_name: billingName || null,
        country_code: countryCode || null,
        tax_id: taxId || null,
      });
      setOverview((prev) => prev ? { ...prev, billing_profile: profile } : prev);
      toast.success('تم تحديث ملف الفوترة');
    } catch (err: any) {
      toast.error(err?.message ?? 'تعذر تحديث ملف الفوترة');
    } finally {
      setSavingProfile(false);
    }
  }

  async function onStartCheckout() {
    if (!selectedPlan) return toast.error('اختر الخطة أولًا');
    setLaunchingCheckout(true);
    try {
      const seatLimitValue = seatLimit.trim() ? Number(seatLimit) : undefined;
      const session = await startBillingCheckout({
        provider: selectedProvider,
        plan_code: selectedPlan,
        interval: selectedInterval,
        seats: Number.isFinite(seatLimitValue as number) ? seatLimitValue : undefined,
      });
      toast.success(session.message ?? 'تم إنشاء جلسة الفوترة بنجاح');
      if (session.url) {
        window.location.assign(session.url);
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'تعذر بدء جلسة الفوترة');
    } finally {
      setLaunchingCheckout(false);
    }
  }

  async function onOpenPortal() {
    setLaunchingPortal(true);
    try {
      const portal = await openBillingPortal({ provider: selectedProvider });
      toast.success(portal.message ?? 'تم فتح بوابة الفوترة');
      if (portal.url) window.open(portal.url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      toast.error(err?.message ?? 'تعذر فتح بوابة الفوترة');
    } finally {
      setLaunchingPortal(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar title="الخطط والفوترة" backTo="/admin" />
      <div className="px-5 pt-5 pb-10 space-y-4">
        <div className="rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm">
          <div className="flex items-center gap-2 text-secondary font-black text-lg">
            <CreditCard className="w-4 h-4" />
            Billing + Provider Lifecycle
          </div>
          <p className="text-sm font-semibold text-muted-foreground mt-1">
            إدارة الخطط، حدود الاستخدام، مزود الفوترة، جلسات الدفع، والـ webhooks داخل الجهة الحالية.
          </p>
        </div>

        {!currentTenant && (
          <div className="rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm space-y-3">
            <p className="font-black text-secondary">لا توجد جهة تشغيل محددة حاليًا</p>
            <p className="text-sm font-semibold text-muted-foreground">اختر جهة تشغيل أولًا من الإعدادات أو من لوحة المنصة لعرض خطة الجهة وحدودها.</p>
            {isPlatform && summaries.length > 0 && (
              <div className="space-y-2 pt-2">
                {summaries.map((row) => (
                  <div key={row.tenant.id} className="rounded-lg border-2 border-secondary/20 bg-surface-alt p-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-black text-secondary">{row.tenant.name}</p>
                      <p className="text-xs font-semibold text-muted-foreground">{row.plan_name} · {row.subscription_status ?? 'بدون اشتراك'} · Seats {row.seats ?? '—'}</p>
                    </div>
                    <button
                      onClick={() => {
                        tenantStore.set(row.tenant.slug);
                        toast.success(`تم اختيار الجهة ${row.tenant.name}`);
                        setTimeout(() => void reload(), 0);
                      }}
                      className="pill bg-primary text-secondary text-xs"
                    >
                      العمل داخلها
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="grid place-items-center py-12"><Loader2 className="w-8 h-8 animate-spin text-secondary" /></div>
        ) : (
          <>
            {overview && (
              <>
                <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Stat icon={<Building2 className="w-4 h-4" />} label="الخطة الحالية" value={overview.plan_catalog?.name ?? overview.tenant_plan?.code ?? '—'} />
                  <Stat icon={<Users className="w-4 h-4" />} label="المقاعد" value={overview.subscription?.seats ?? overview.tenant_plan?.seat_limit ?? '—'} />
                  <Stat icon={<ShieldCheck className="w-4 h-4" />} label="الحالة" value={overview.subscription?.status ?? overview.tenant_plan?.status ?? '—'} />
                  <Stat icon={<BarChart3 className="w-4 h-4" />} label="الاستخدام الحالي" value={`${overview.usage.stations}/${renderLimit(overview.effective_limits?.stations)}`} />
                </section>

                <section className="rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm space-y-3">
                  <div>
                    <p className="font-black text-secondary">الخطة والتسعير</p>
                    <p className="text-xs font-semibold text-muted-foreground">اختر الخطة الحالية، عدد المقاعد، وفاصل الفوترة المناسب.</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    {plans.map((plan) => (
                      <button
                        key={plan.code}
                        onClick={() => setSelectedPlan(plan.code)}
                        className={`rounded-xl border-2 p-4 text-start shadow-tactile-sm transition ${selectedPlan === plan.code ? 'border-primary bg-primary/10' : 'border-secondary bg-surface-alt'}`}
                      >
                        <p className="font-black text-secondary">{plan.name}</p>
                        <p className="text-xs font-semibold text-muted-foreground mt-1">{plan.description}</p>
                        <p className="text-sm font-black text-secondary mt-3">{money(plan)}</p>
                        <p className="text-[11px] font-semibold text-muted-foreground mt-1">Seats: {renderLimit(plan.included_seats)}</p>
                      </button>
                    ))}
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="block">
                      <span className="text-xs font-black text-secondary">الخطة المختارة</span>
                      <select className="input-admin mt-1" value={selectedPlan} onChange={(e) => setSelectedPlan(e.target.value)}>
                        {plans.map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-black text-secondary">Billing interval</span>
                      <select className="input-admin mt-1" value={selectedInterval} onChange={(e) => setSelectedInterval(e.target.value as 'monthly' | 'yearly' | 'custom')}>
                        <option value="monthly">شهري</option>
                        <option value="yearly">سنوي</option>
                        <option value="custom">مخصص</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-black text-secondary">Seat limit override</span>
                      <input className="input-admin mt-1" value={seatLimit} onChange={(e) => setSeatLimit(e.target.value)} placeholder={String(selectedCatalog?.included_seats ?? '')} />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={onSavePlan} disabled={!canManageTenantBilling || savingPlan} className="btn-primary disabled:opacity-50">
                      {savingPlan ? 'جارٍ الحفظ...' : 'حفظ الخطة الحالية'}
                    </button>
                    {!canManageTenantBilling && <span className="text-xs font-semibold text-muted-foreground">عرض فقط — يحتاج tenant_owner أو tenant_admin أو platform_admin.</span>}
                  </div>
                </section>

                <section className="rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm space-y-3">
                  <div>
                    <p className="font-black text-secondary">مزود الفوترة والجلسات</p>
                    <p className="text-xs font-semibold text-muted-foreground">ابدأ Checkout خارجي عبر Stripe أو Lemon Squeezy أو استخدم وضع manual للاتفاقات المباشرة.</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-black text-secondary">مزود الفوترة</span>
                      <select className="input-admin mt-1" value={selectedProvider} onChange={(e) => setSelectedProvider(e.target.value as BillingProvider)}>
                        <option value="manual">Manual</option>
                        <option value="stripe">Stripe</option>
                        <option value="lemon_squeezy">Lemon Squeezy</option>
                      </select>
                    </label>
                    <div className="rounded-lg border-2 border-secondary/20 bg-surface-alt p-3">
                      <p className="text-xs font-bold text-muted-foreground">حالة المزود</p>
                      <p className="text-sm font-black text-secondary mt-1">{currentProviderOption?.configured ? 'Configured' : 'غير مُهيأ'}</p>
                      <p className="text-[11px] font-semibold text-muted-foreground mt-1">
                        Checkout: {currentProviderOption?.can_checkout ? 'جاهز' : 'غير متاح'} · Portal: {currentProviderOption?.can_portal ? 'جاهز' : 'غير متاح'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={onStartCheckout} disabled={!canManageTenantBilling || launchingCheckout} className="btn-primary disabled:opacity-50">
                      {launchingCheckout ? 'جارٍ إنشاء الجلسة...' : 'بدء Checkout'}
                    </button>
                    <button onClick={onOpenPortal} disabled={!canManageTenantBilling || launchingPortal} className="btn-secondary disabled:opacity-50 inline-flex items-center gap-2">
                      <ExternalLink className="w-4 h-4" />
                      {launchingPortal ? 'جارٍ الفتح...' : 'فتح Billing Portal'}
                    </button>
                  </div>
                  <div className="rounded-lg border-2 border-secondary/20 bg-surface-alt p-3 text-xs font-semibold text-muted-foreground">
                    المزوّد الحالي: <span className="font-black text-secondary">{overview.billing_profile?.provider ?? overview.subscription?.provider ?? 'manual'}</span>
                    {overview.subscription?.external_subscription_id && (
                      <span> · External subscription: <span className="font-black text-secondary">{overview.subscription.external_subscription_id}</span></span>
                    )}
                    {overview.subscription?.last_webhook_at && (
                      <span> · آخر webhook: <span className="font-black text-secondary">{new Date(overview.subscription.last_webhook_at).toLocaleString('ar-EG')}</span></span>
                    )}
                  </div>
                </section>

                <section className="rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm space-y-3">
                  <div>
                    <p className="font-black text-secondary">الحدود والاستخدام</p>
                    <p className="text-xs font-semibold text-muted-foreground">لقطة حالية للاستهلاك مقابل حدود الخطة الفعالة.</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    {[
                      ['stations', 'المواقف'],
                      ['lines', 'الخطوط'],
                      ['route_stops', 'المحطات'],
                      ['members', 'الأعضاء'],
                      ['pending_invites', 'الدعوات المعلقة'],
                      ['seats', 'المقاعد المحجوزة'],
                    ].map(([key, label]) => (
                      <div key={key} className="rounded-lg border-2 border-secondary/20 bg-surface-alt p-3">
                        <p className="text-xs font-bold text-muted-foreground">{label}</p>
                        <p className="text-2xl font-black text-secondary mt-1">{String((overview.usage as any)[key] ?? 0)}</p>
                        <p className="text-[11px] font-semibold text-muted-foreground mt-1">الحد: {renderLimit((overview.effective_limits as any)?.[key])}</p>
                        <p className="text-[11px] font-semibold text-muted-foreground">المتبقي: {renderLimit((overview.usage_remaining as any)?.[key])}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm space-y-3">
                  <div>
                    <p className="font-black text-secondary">مزايا الخطة الحالية</p>
                    <p className="text-xs font-semibold text-muted-foreground">هذه هي المزايا الفعالة حاليًا بعد دمج الخطة الأساسية مع أي overrides على مستوى الجهة.</p>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {FEATURE_CATALOG.map((feature) => {
                      const enabled = hasFeature(overview.effective_features, feature.key);
                      return (
                        <div key={feature.key} className="rounded-lg border-2 border-secondary/20 bg-surface-alt p-3 flex items-start justify-between gap-3">
                          <div>
                            <p className="font-black text-secondary text-sm">{feature.label}</p>
                            <p className="text-[11px] font-semibold text-muted-foreground mt-1">{feature.description}</p>
                          </div>
                          <span className={`pill text-xs ${enabled ? 'bg-primary text-secondary' : 'bg-surface text-muted-foreground'}`}>
                            {enabled ? 'متاح' : 'يتطلب ترقية'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="rounded-lg border-2 border-secondary/20 bg-surface-alt p-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-muted-foreground">الخطة الحالية</p>
                      <p className="font-black text-secondary">{overview.plan_catalog?.name ?? overview.tenant_plan?.code ?? '—'}</p>
                    </div>
                    <button onClick={onStartCheckout} disabled={!canManageTenantBilling || launchingCheckout} className="btn-primary disabled:opacity-50 inline-flex items-center gap-2">
                      <Crown className="w-4 h-4" /> ترقية المزايا
                    </button>
                  </div>
                </section>

                <section className="rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm space-y-3">
                  <div>
                    <p className="font-black text-secondary">ملف الفوترة</p>
                    <p className="text-xs font-semibold text-muted-foreground">هذه الحقول تُستخدم في checkout/portal وربط العملاء بالمزوّد الخارجي.</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block"><span className="text-xs font-black text-secondary">Billing email</span><input className="input-admin mt-1" dir="ltr" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} /></label>
                    <label className="block"><span className="text-xs font-black text-secondary">Billing name</span><input className="input-admin mt-1" value={billingName} onChange={(e) => setBillingName(e.target.value)} /></label>
                    <label className="block"><span className="text-xs font-black text-secondary">Country code</span><input className="input-admin mt-1" dir="ltr" value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} /></label>
                    <label className="block"><span className="text-xs font-black text-secondary">Tax ID</span><input className="input-admin mt-1" dir="ltr" value={taxId} onChange={(e) => setTaxId(e.target.value)} /></label>
                  </div>
                  <button onClick={onSaveProfile} disabled={!canManageTenantBilling || savingProfile} className="btn-secondary disabled:opacity-50">
                    {savingProfile ? 'جارٍ الحفظ...' : 'حفظ ملف الفوترة'}
                  </button>
                </section>

                <section className="rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm space-y-3">
                  <div className="flex items-center gap-2 text-secondary font-black">
                    <Webhook className="w-4 h-4" />
                    آخر Billing Webhooks
                  </div>
                  <p className="text-xs font-semibold text-muted-foreground">هذه اللقطة تساعدك على تأكيد وصول الأحداث من Stripe أو Lemon Squeezy ومتابعة الـ lifecycle.</p>
                  {webhooks.length === 0 ? (
                    <div className="rounded-lg border-2 border-dashed border-secondary/30 bg-surface-alt p-4 text-sm font-semibold text-muted-foreground">
                      لا توجد webhooks بعد. ستظهر هنا فور وصول أول حدث من مزود الفوترة.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {webhooks.map((hook) => (
                        <div key={hook.id} className="rounded-lg border-2 border-secondary/20 bg-surface-alt p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="pill bg-secondary text-secondary-foreground text-xs">{hook.provider}</span>
                            <span className="pill bg-secondary text-secondary-foreground text-xs">{hook.event_type}</span>
                            <span className={`pill text-xs ${hook.processed ? 'bg-primary text-secondary' : 'bg-surface text-foreground'}`}>{hook.processed ? 'Processed' : 'Pending'}</span>
                            <span className={`pill text-xs ${hook.signature_valid ? 'bg-primary text-secondary' : 'bg-destructive text-destructive-foreground'}`}>{hook.signature_valid ? 'Signature OK' : 'Bad signature'}</span>
                          </div>
                          <p className="text-xs font-semibold text-muted-foreground mt-2">{new Date(hook.created_at).toLocaleString('ar-EG')}</p>
                          {hook.error_message && <p className="text-xs font-semibold text-destructive mt-1">{hook.error_message}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}

            {isPlatform && summaries.length > 0 && (
              <section className="rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm space-y-3">
                <div className="flex items-center gap-2 text-secondary font-black">
                  <ReceiptText className="w-4 h-4" />
                  ملخص الخطط عبر الجهات
                </div>
                <div className="space-y-2">
                  {summaries.map((row) => (
                    <div key={row.tenant.id} className="rounded-lg border-2 border-secondary/20 bg-surface-alt p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-black text-secondary">{row.tenant.name}</p>
                        <p className="text-xs font-semibold text-muted-foreground">{row.plan_name} · {row.subscription_status ?? '—'} · Seats {row.seats ?? '—'}</p>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <span className="pill bg-secondary text-secondary-foreground text-xs">Stations {row.usage.stations}/{renderLimit(row.effective_limits?.stations)}</span>
                        <span className="pill bg-secondary text-secondary-foreground text-xs">Lines {row.usage.lines}/{renderLimit(row.effective_limits?.lines)}</span>
                        <button onClick={() => { tenantStore.set(row.tenant.slug); toast.success(`تم اختيار ${row.tenant.name}`); }} className="pill bg-primary text-secondary text-xs">اختيار الجهة</button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-xl border-2 border-secondary bg-surface p-3 shadow-tactile-sm">
      <div className="flex items-center gap-1.5 text-secondary">{icon}<span className="text-xs font-bold">{label}</span></div>
      <p className="text-2xl font-black text-secondary mt-1 tabular">{value}</p>
    </div>
  );
}
