import { createFileRoute, Link, useNavigate } from "@/marketing/routerCompat";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Copy, Gift, Loader2, Users, Trophy, Share2, ShieldCheck, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/marketing/hooks/useAuth";
import { buildInviteUrl, buildWhatsAppInvite, getMyReferralInfo, type MyReferralInfo } from "@/marketing/lib/referrals";
import { trackGrowthEvent } from "@/marketing/lib/growth";

export const Route = createFileRoute("/invite")({
  component: InvitePage,
  head: () => ({
    meta: [
      { title: "ادعِ صحابك وابقى خبير منطقتك" },
      { name: "description", content: "ادعِ صحابك، اجمع نقاط، افتح badges، واظهر في leaderboard منطقتك." },
    ],
  }),
});

function InvitePage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState<MyReferralInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) { navigate({ to: "/login" }); return; }
    if (user) {
      getMyReferralInfo().then(setInfo).finally(() => setLoading(false));
    }
  }, [authLoading, user, navigate]);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* ignore */ }
  };

  if (loading || !info) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const url = buildInviteUrl(info.code);
  const wa = buildWhatsAppInvite(info.code);
  const earned = info.count * 30;

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Link to="/"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 ml-1" />رجوع</Button></Link>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-fuchsia-500 p-2 text-white"><Gift className="h-4 w-4" /></div>
            <h1 className="text-base font-bold text-slate-900">دعوات ومكافآت</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <div className="rounded-3xl bg-gradient-to-br from-fuchsia-600 via-pink-500 to-amber-400 p-6 text-white shadow-lg">
          <div className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-bold backdrop-blur">
            <Trophy className="h-3.5 w-3.5" /> خليك معروف في منطقتك
          </div>
          <h2 className="mt-4 text-3xl font-black leading-tight">جيب صحابك، واجمع سمعة مش بس نقاط.</h2>
          <p className="mt-2 text-sm leading-7 text-white/90">
            كل صاحب يدخل بكودك وكل رحلة ناجحة وكل بلاغ مفيد يقرّبك من لقب محلي زي: خبير رمسيس، منقذ الخط، أو بطل الموقف.
          </p>
          <div className="mt-5 rounded-2xl bg-white/15 p-4 backdrop-blur">
            <p className="text-xs opacity-90">كودك للدعوة</p>
            <p className="mt-1 select-all font-mono text-4xl font-black tracking-wider">{info.code}</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-white/15 p-3 backdrop-blur">
              <div className="flex items-center gap-1 text-xs opacity-90"><Users className="h-3 w-3" /> أصحاب جبتهم</div>
              <p className="mt-1 text-2xl font-bold">{info.count}</p>
            </div>
            <div className="rounded-lg bg-white/15 p-3 backdrop-blur">
              <div className="flex items-center gap-1 text-xs opacity-90"><Gift className="h-3 w-3" /> نقاط من الدعوات</div>
              <p className="mt-1 text-2xl font-bold">{earned}</p>
            </div>
          </div>
          <div className="mt-4 rounded-2xl bg-slate-950/35 p-4 backdrop-blur">
            <div className="flex items-center justify-between gap-3 text-sm font-black">
              <span>🎯 ادعُ 3 صحاب وافتح Badge مؤسس المنطقة</span>
              <span>{Math.min(info.count, info.founderGoal)}/{info.founderGoal}</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-emerald-300" style={{ width: `${Math.min(100, (info.count / info.founderGoal) * 100)}%` }} />
            </div>
            <p className="mt-2 text-xs text-white/85">
              {info.founderUnlocked ? "اتفتح لك هدف مؤسس المنطقة — كمّل وخلّي اسمك يظهر أعلى." : `باقي ${info.founderRemaining} دعوة نشطة وتفتح لقب مؤسس المنطقة.`}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <b>ليه أدعي حد؟</b> لأن عندك هدف واضح: ادعُ 3 صحاب وافتح Badge مؤسس المنطقة. المكافأة هنا مكانة وثقة وظهور، مش فلوس.
          </div>
          <p className="text-sm text-slate-700">
            <b>صاحبك يكسب 30 نقطة</b> أول ما يسجل بكودك، و <b>إنت كمان تكسب 30 نقطة</b>. لما يبدأ يستخدم الرحلات والمشاركة، ده يقوّي ترتيبك كـ contributor جاب ناس فعلاً.
          </p>

          <a
            href={wa}
            onClick={() => void trackGrowthEvent("invite_sent", { channel: "whatsapp", surface: "invite_page" }, info.code)}
            target="_blank" rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-3 text-sm font-bold text-white hover:opacity-90"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.8-1.6-2.1-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.6-1.5-.9-2.1-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.3-.7.3-1.3.2-1.4 0-.1-.3-.2-.6-.3zM12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.1-1.3c1.4.8 3.1 1.2 4.9 1.2 5.5 0 10-4.5 10-10S17.5 2 12 2z"/>
            </svg>
            ابعت دعوة على واتساب
          </a>

          <div className="flex items-stretch gap-2">
            <input
              readOnly
              value={url}
              className="flex-1 rounded-lg border bg-slate-50 px-3 py-2 text-xs text-slate-700"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button variant="outline" size="sm" onClick={() => copy(url)} className="gap-1 shrink-0">
              {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              {copied ? "تم" : "نسخ"}
            </Button>
          </div>
        </div>


        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900">سلم المكافآت</h2>
              <p className="mt-1 text-xs text-slate-500">أفعال بسيطة تتحول لنقاط وظهور وثقة في منطقتك.</p>
            </div>
            <Star className="h-6 w-6 text-amber-500" />
          </div>
          <div className="space-y-2 text-sm">
            {[
              ["دعوة صديق", "+30 نقطة", Gift],
              ["الصديق يعمل أول رحلة", "ترقية contributor", Users],
              ["مشاركة route ناجحة", "صفحة قابلة للمشاركة", Share2],
              ["بلاغ زحمة/تعطل", "+3 نقاط", ShieldCheck],
              ["إجابة سؤال مستخدم", "نقاط السؤال", Trophy],
            ].map(([label, reward, Icon]) => {
              const I = Icon as typeof Gift;
              return (
                <div key={label as string} className="flex items-center justify-between gap-3 rounded-xl border bg-slate-50 p-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-white p-2 text-fuchsia-600 shadow-sm"><I className="h-4 w-4" /></span>
                    <span className="font-semibold text-slate-800">{label as string}</span>
                  </div>
                  <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-black text-white">{reward as string}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          💡 أعلى المساهمين في الـ <Link to="/leaderboard" className="underline font-bold">Leaderboard</Link> · <Link to="/growth" className="underline font-bold">راقب K-factor</Link> بيظهروا كأبطال مناطق، مش مجرد أرقام.
        </div>
      </main>
    </div>
  );
}


export default Route.component;
