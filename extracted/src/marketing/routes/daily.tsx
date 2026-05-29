import { createFileRoute, Link } from "@/marketing/routerCompat";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Bell, BellRing, CalendarClock, CheckCircle2, Loader2, MessageCircle, RefreshCw, Route as RouteIcon, Share2, Sparkles, WalletCards, AlertTriangle, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/marketing/hooks/useAuth";
import { buildDailyWhatsAppText, fetchDailyBrief, maybeNotifyDailyBrief, saveMyDailyLine, type DailyBrief } from "@/marketing/lib/dailyCommute";
import { ALERT_META, timeAgo } from "@/marketing/lib/alerts";

export const Route = createFileRoute("/daily")({
  component: DailyPage,
  head: () => ({
    meta: [
      { title: "خطي اليومي — مواصلات" },
      { name: "description", content: "اختار بيتك وشغلك، ومواصلات يقولك كل صباح التأخير والبديل وبلاغات الناس حول خطك." },
    ],
  }),
});

function DailyPage() {
  const { user } = useAuth();
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ from_location: "", to_location: "", line_name: "", morning_time: "08:00", notifications_enabled: true });
  const [permission, setPermission] = useState(typeof Notification === "undefined" ? "unsupported" : Notification.permission);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchDailyBrief();
      setBrief(data);
      if (data.line) {
        setForm({
          from_location: data.line.from_location,
          to_location: data.line.to_location,
          line_name: data.line.line_name ?? "",
          morning_time: data.line.morning_time,
          notifications_enabled: data.line.notifications_enabled,
        });
        maybeNotifyDailyBrief(data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const shareUrl = useMemo(() => {
    if (!brief) return "#";
    return `https://wa.me/?text=${encodeURIComponent(buildDailyWhatsAppText(brief))}`;
  }, [brief]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveMyDailyLine(form);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const requestNotifications = async () => {
    if (!("Notification" in window)) return;
    const next = await Notification.requestPermission();
    setPermission(next);
    if (next === "granted" && brief) maybeNotifyDailyBrief(brief);
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/marketing" className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white">
            <ArrowRight className="h-4 w-4" /> رجوع
          </Link>
          <Button size="sm" variant="outline" className="gap-2 border-white/20 bg-white/10 text-white hover:bg-white/15" onClick={load}>
            <RefreshCw className="h-4 w-4" /> حدّث
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-4xl gap-5 px-4 py-6 md:grid-cols-[1.05fr_0.95fr]">
        <section className="space-y-4">
          <div className="rounded-3xl border border-sky-400/20 bg-gradient-to-br from-sky-500/20 via-slate-900 to-slate-950 p-5 shadow-2xl shadow-sky-950/40">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-slate-950">
              <CalendarClock className="h-4 w-4" /> سبب يومي تفتح عشانه مواصلات
            </div>
            <h1 className="text-3xl font-black leading-tight md:text-4xl">خطي اليومي</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              اختار بيتك وشغلك مرة واحدة، وكل صباح شوف التأخير، البديل الأسرع، بلاغات الناس حوالين محطتك، واسأل أهل الخط قبل ما تنزل.
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center rounded-3xl border border-white/10 bg-white/5 py-16"><Loader2 className="h-7 w-7 animate-spin text-sky-300" /></div>
          ) : brief && (
            <div className="rounded-3xl border border-white/10 bg-white p-5 text-slate-950 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-sky-700">ملخص الصبح</p>
                  <h2 className="mt-1 text-2xl font-black leading-tight">{brief.headline}</h2>
                </div>
                <div className={`rounded-2xl px-3 py-2 text-center ${brief.delayMinutes > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                  <p className="text-[11px] font-bold">الحالة</p>
                  <p className="text-lg font-black">{brief.delayMinutes > 0 ? `+${brief.delayMinutes} د` : "سالك"}</p>
                </div>
              </div>

              {brief.line ? (
                <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    <RouteIcon className="h-4 w-4 text-sky-600" /> {brief.line.from_location} ← {brief.line.to_location}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{brief.line.line_name || "خطك المعتاد"} · تنبيه {brief.line.morning_time}</p>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">ابدأ بإضافة خطك اليومي من النموذج.</div>
              )}

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Metric icon={<AlertTriangle className="h-4 w-4" />} label="بلاغات خطك" value={brief.matchingAlerts.length} />
                <Metric icon={<WalletCards className="h-4 w-4" />} label="وفرت أسبوعيًا" value={`${brief.savings.moneySavedEGP}ج`} />
                <Metric icon={<MessageCircle className="h-4 w-4" />} label="سؤال جاهز" value="1" />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <a href={shareUrl} target="_blank" rel="noreferrer">
                  <Button className="gap-2 bg-emerald-500 hover:bg-emerald-600"><Share2 className="h-4 w-4" /> ابعت للجروب</Button>
                </a>
                <Link to={{ to: "/chat", search: { q: brief.questionText } }}>
                  <Button variant="outline" className="gap-2"><MessageCircle className="h-4 w-4" /> اسأل أهل الخط</Button>
                </Link>
                {permission !== "granted" && (
                  <Button variant="outline" className="gap-2" onClick={requestNotifications}><BellRing className="h-4 w-4" /> فعّل تنبيه الصبح</Button>
                )}
              </div>
            </div>
          )}

          {brief && (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold"><MapPin className="h-4 w-4 text-rose-300" /> آخر بلاغات الناس حول خطك</h2>
              {[...brief.matchingAlerts, ...brief.nearbyAlerts].slice(0, 5).length === 0 ? (
                <p className="rounded-2xl bg-emerald-400/10 p-4 text-sm text-emerald-100">مفيش بلاغات حوالين خطك دلوقتي. لو شوفت حاجة، بلّغ وخد نقاط.</p>
              ) : (
                <ul className="space-y-2">
                  {[...brief.matchingAlerts, ...brief.nearbyAlerts].slice(0, 5).map((a) => {
                    const meta = ALERT_META[a.type] ?? { emoji: "⚠️", color: "" };
                    return <li key={a.id} className="rounded-2xl bg-white p-3 text-slate-950">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black">{meta.emoji} {a.type} — {a.location}</p>
                          <p className="mt-1 text-xs text-slate-500">{a.line_name || "خط غير محدد"} · {timeAgo(a.created_at)} · {a.confirmations_count} تأكيد</p>
                          {a.description && <p className="mt-1 text-xs text-slate-700">{a.description}</p>}
                        </div>
                      </div>
                    </li>;
                  })}
                </ul>
              )}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <form onSubmit={submit} className="rounded-3xl border border-white/10 bg-white p-5 text-slate-950 shadow-xl">
            <h2 className="text-lg font-black">ظبط خطك اليومي</h2>
            <p className="mt-1 text-xs text-slate-500">مثال: بيتي في فيصل → شغلي في مدينة نصر.</p>
            <label className="mt-4 block text-xs font-bold text-slate-600">منين؟</label>
            <input required value={form.from_location} onChange={(e) => setForm((f) => ({ ...f, from_location: e.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" placeholder="فيصل / شبرا / المعادي" />
            <label className="mt-3 block text-xs font-bold text-slate-600">لحد فين؟</label>
            <input required value={form.to_location} onChange={(e) => setForm((f) => ({ ...f, to_location: e.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" placeholder="مدينة نصر / رمسيس / التحرير" />
            <label className="mt-3 block text-xs font-bold text-slate-600">اسم الخط أو المواصلة</label>
            <input value={form.line_name} onChange={(e) => setForm((f) => ({ ...f, line_name: e.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" placeholder="ميكروباص رمسيس / مترو / أتوبيس" />
            <label className="mt-3 block text-xs font-bold text-slate-600">ميعاد التنبيه</label>
            <input type="time" value={form.morning_time} onChange={(e) => setForm((f) => ({ ...f, morning_time: e.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
            <label className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm">
              <input type="checkbox" checked={form.notifications_enabled} onChange={(e) => setForm((f) => ({ ...f, notifications_enabled: e.target.checked }))} />
              ابعتلي تنبيه لو خطي عليه تأخير
            </label>
            <Button type="submit" disabled={saving} className="mt-4 w-full gap-2 bg-sky-600 hover:bg-sky-700">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} حفظ خطي اليومي
            </Button>
            {!user && <p className="mt-3 text-center text-[11px] text-slate-500">هيتحفظ على جهازك. سجل دخول عشان يتزامن مع حسابك.</p>}
          </form>

          <div className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-5 text-amber-50">
            <Sparkles className="mb-2 h-5 w-5 text-amber-300" />
            <h3 className="font-black">التغليف اليومي البسيط</h3>
            <ul className="mt-3 space-y-2 text-sm text-amber-50/90">
              <li>• تنبيه خطي اليومي كل صباح.</li>
              <li>• وفّرت كام هذا الأسبوع؟</li>
              <li>• آخر بلاغات الناس حول محطتك.</li>
              <li>• اسأل أهل الخط قبل ما تنزل.</li>
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return <div className="rounded-2xl bg-slate-100 p-3">
    <div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sky-700">{icon}</div>
    <p className="text-lg font-black">{value}</p>
    <p className="text-[11px] text-slate-500">{label}</p>
  </div>;
}
