import { createFileRoute, Link } from "@/marketing/routerCompat";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { ArrowLeft, BarChart3, Clock3, Loader2, MousePointerClick, Rocket, Route as RouteIcon, Share2, TrendingUp, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getGrowthDashboard, type GrowthDashboard } from "@/marketing/lib/growth";

export const Route = createFileRoute("/growth")({
  component: GrowthPage,
  head: () => ({
    meta: [
      { title: "Growth Dashboard — مواصلات" },
      { name: "description", content: "تابع invite funnel و K-factor و viral cycle time لمواصلات." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const demo: GrowthDashboard = {
  invite_sent: 0,
  invite_opened: 0,
  signup_from_invite: 0,
  first_trip_created: 0,
  share_trip_created: 0,
  shared_route_opened: 0,
  k_factor: 0,
  viral_cycle_time_hours: null,
  invite_to_signup_rate: 0,
  signup_to_first_trip_rate: 0,
  open_to_first_trip_rate: 0,
};

function GrowthPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<GrowthDashboard>(demo);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    getGrowthDashboard(days)
      .then((result) => { if (!cancelled) setData(result); })
      .catch((error) => { if (!cancelled) setErr(error instanceof Error ? error.message : "تعذر تحميل أرقام النمو"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  const kStatus = useMemo(() => {
    if (data.k_factor >= 1) return { label: "النمو في وضع انتشار", tone: "bg-emerald-50 text-emerald-800 border-emerald-200" };
    if (data.k_factor >= 0.4) return { label: "فيه بذور انتشار — محتاج تحسين التحويل", tone: "bg-amber-50 text-amber-900 border-amber-200" };
    return { label: "الانتشار لسه ضعيف — ركّز على invite → first trip", tone: "bg-rose-50 text-rose-800 border-rose-200" };
  }, [data.k_factor]);

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/"><Button variant="ghost" size="sm"><ArrowLeft className="ml-1 h-4 w-4" />رجوع</Button></Link>
            <div className="rounded-lg bg-slate-900 p-2 text-white"><BarChart3 className="h-4 w-4" /></div>
            <div>
              <h1 className="text-base font-black text-slate-900">Growth Dashboard</h1>
              <p className="text-xs text-slate-500">اعرف هل المستخدمين بيجيبوا مستخدمين فعلاً ولا لأ</p>
            </div>
          </div>
          <div className="flex gap-2">
            {[7, 14, 30].map((d) => (
              <Button key={d} variant={days === d ? "default" : "outline"} size="sm" onClick={() => setDays(d)}>{d} يوم</Button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 p-6 text-white shadow-lg">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold">
            <Rocket className="h-3.5 w-3.5" /> الهدف الحقيقي: K-factor أكبر من 1
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-[1.2fr_0.8fr] md:items-end">
            <div>
              <h2 className="text-3xl font-black leading-tight md:text-5xl">هل مواصلات بينتشر لوحده؟</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-200">
                هنا بنقيس رحلة النمو كاملة: دعوة اتبعتت، الرابط اتفتح، المستخدم سجل، عمل أول رحلة، وشارك رحلة تانية. من غير الأرقام دي مش هنعرف هل المنتج viral ولا مجرد عنده referral link.
              </p>
            </div>
            <div className={`rounded-2xl border p-5 ${kStatus.tone}`}>
              <p className="text-xs font-bold opacity-80">K-factor الحالي</p>
              <p className="mt-1 text-5xl font-black">{data.k_factor.toFixed(2)}</p>
              <p className="mt-2 text-sm font-bold">{kStatus.label}</p>
            </div>
          </div>
        </section>

        {err && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{err}</div>}
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : (
          <>
            <section className="grid gap-3 md:grid-cols-3 lg:grid-cols-7">
              <Metric icon={Share2} label="invite_sent" value={data.invite_sent} hint="دعوات اتبعتت" />
              <Metric icon={MousePointerClick} label="invite_opened" value={data.invite_opened} hint="فتحوا رابط الدعوة" />
              <Metric icon={UserPlus} label="signup_from_invite" value={data.signup_from_invite} hint="سجلوا من دعوة" />
              <Metric icon={RouteIcon} label="first_trip_created" value={data.first_trip_created} hint="عملوا أول رحلة" />
              <Metric icon={Users} label="share_trip_created" value={data.share_trip_created} hint="رحلات اتشاركت" />
              <Metric icon={MousePointerClick} label="shared_route_opened" value={data.shared_route_opened} hint="فتحوا route مشترك" />
              <Metric icon={Clock3} label="viral_cycle_time" value={data.viral_cycle_time_hours == null ? "—" : `${data.viral_cycle_time_hours}س`} hint="من دعوة لاستخدام" />
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
              <FunnelCard title="Invite → Signup" value={data.invite_to_signup_rate} from={data.invite_sent} to={data.signup_from_invite} />
              <FunnelCard title="Signup → First trip" value={data.signup_to_first_trip_rate} from={data.signup_from_invite} to={data.first_trip_created} />
              <FunnelCard title="Open → First trip" value={data.open_to_first_trip_rate} from={data.invite_opened} to={data.first_trip_created} />
            </section>

            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-sky-600" />
                <h2 className="text-lg font-black text-slate-900">ماذا نفعل بالأرقام؟</h2>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <Action title="لو invite_opened قليل" body="المشكلة غالبًا في نص واتساب أو OG preview. جرّب headline أوضح وصورة route أقوى." />
                <Action title="لو signup_from_invite قليل" body="قلل الاحتكاك: افتح route الأول، وخلي التسجيل بعد ما يشوف القيمة." />
                <Action title="لو first_trip_created قليل" body="اعمل CTA واحد بعد التسجيل: احسب طريقك الآن، مع route demo جاهز من منطقته." />
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Metric({ icon: Icon, label, value, hint }: { icon: ComponentType<{ className?: string }>; label: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <Icon className="h-4 w-4 text-sky-600" />
        <span className="text-[10px] font-mono text-slate-400">{label}</span>
      </div>
      <p className="mt-3 text-3xl font-black text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function FunnelCard({ title, value, from, to }: { title: string; value: number; from: number; to: number }) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-black text-slate-900">{title}</h3>
        <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-black text-white">{value}%</span>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
      </div>
      <p className="mt-3 text-xs text-slate-500">من {from} إلى {to}</p>
    </div>
  );
}

function Action({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-4">
      <h3 className="font-bold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
    </div>
  );
}

export default Route.component;
