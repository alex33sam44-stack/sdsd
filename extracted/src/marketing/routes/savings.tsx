import { createFileRoute, Link, useRouter } from "@/marketing/routerCompat";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2, Share2, Sparkles, Leaf, Coins, Users, Bus, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/marketing/hooks/useAuth";
import { fetchMySavings, buildShareText, type SavingsStats } from "@/marketing/lib/savings";
import { getMyReferralInfo, buildInviteUrl } from "@/marketing/lib/referrals";
import { shareStoryCard } from "@/marketing/lib/storyCard";

export const Route = createFileRoute("/savings")({
  component: SavingsPage,
  head: () => ({
    meta: [
      { title: "وفّرت كذا — مواصلات" },
      { name: "description", content: "شوف كم وفّرت من فلوس و كم قللت من تلوث باستخدام مواصلات" },
    ],
  }),
});

function SavingsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [stats, setStats] = useState<SavingsStats | null>(null);
  const [refLink, setRefLink] = useState<string>("");

  useEffect(() => {
    if (loading) return;
    if (!user) { router.navigate({ to: "/login" }); return; }
    (async () => {
      const [s, r] = await Promise.all([fetchMySavings(), getMyReferralInfo()]);
      setStats(s);
      setRefLink(r ? buildInviteUrl(r.code) : (typeof window !== "undefined" ? window.location.origin : ""));
    })();
  }, [user, loading, router]);

  const share = () => {
    if (!stats) return;
    const text = buildShareText(stats, refLink);
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-sky-50">
      <header className="border-b bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-slate-700 hover:text-slate-900">
            <ArrowRight className="h-4 w-4" /> رجوع
          </Link>
          <h1 className="font-bold text-slate-900">وفّرت كذا 💚</h1>
          <div className="w-12" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-5">
        {!stats ? (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            {/* Hero card — shareable */}
            <div id="share-card" className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-teal-500 to-sky-500 p-6 text-white shadow-xl">
              <div className="absolute -top-10 -left-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
              <div className="absolute -bottom-12 -right-8 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
              <div className="relative">
                <div className="flex items-center gap-2 text-white/90 text-sm">
                  <Sparkles className="h-4 w-4" /> إنجازك مع مواصلات
                </div>
                <div className="mt-3">
                  <div className="text-5xl font-extrabold tracking-tight">
                    {stats.moneySavedEGP.toLocaleString("ar-EG")} <span className="text-2xl font-bold">ج.م</span>
                  </div>
                  <div className="text-white/90 mt-1">وفّرتهم بدل التاكسي 🚖</div>
                </div>
                <div className="mt-6 grid grid-cols-3 gap-3 text-center">
                  <Stat icon={<Bus className="h-4 w-4" />} value={stats.tripsCount} label="رحلة" />
                  <Stat icon={<Leaf className="h-4 w-4" />} value={`${stats.co2SavedKg}`} label="كجم CO₂" />
                  <Stat icon={<Users className="h-4 w-4" />} value={stats.peopleHelped} label="ساعدتهم" />
                </div>
              </div>
            </div>

            {/* Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Tile color="emerald" icon={<Coins />} title="فلوس وفّرتها" value={`${stats.moneySavedEGP} ج.م`} hint={`${stats.tripsCount} رحلة × فرق ٢٧ ج.م`} />
              <Tile color="teal" icon={<Leaf />} title="انبعاثات قللتها" value={`${stats.co2SavedKg} كجم`} hint="مقارنة بسيارة خاصة" />
              <Tile color="sky" icon={<Bus />} title="رحلاتك" value={`${stats.tripsCount}`} hint="رحلة شاركتها أو سجّلتها" />
              <Tile color="fuchsia" icon={<Users />} title="بلاغاتك" value={`${stats.alertsReported}`} hint={`ساعدت ${stats.peopleHelped} شخص تقريباً`} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button onClick={share} size="lg" className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700">
                <Share2 className="h-5 w-5" /> شيّر على واتساب
              </Button>
              <Button
                onClick={() => stats && shareStoryCard({
                  template: "savings",
                  title: `وفّرت ${stats.moneySavedEGP} ج.م`,
                  subtitle: "بدل التاكسي 🚖",
                  emoji: "💸",
                  meta: [
                    `${stats.tripsCount} رحلة • ${stats.co2SavedKg} كجم CO₂`,
                    `${stats.alertsReported} بلاغ ساعد ${stats.peopleHelped} شخص`,
                  ],
                  cta: "wsel.app — جرّبها مجاناً",
                })}
                size="lg"
                variant="outline"
                className="w-full gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              >
                <ImageIcon className="h-5 w-5" /> اعمل ستوري 📸
              </Button>
            </div>

            <p className="text-xs text-slate-500 text-center">
              التقديرات مبنية على متوسط أسعار التاكسي مقابل المواصلات العامة في مصر. كل ما تستخدم التطبيق، الأرقام بتكبر 💪
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-2xl bg-white/15 backdrop-blur p-3 border border-white/20">
      <div className="flex items-center justify-center text-white/90">{icon}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      <div className="text-[11px] text-white/80">{label}</div>
    </div>
  );
}

function Tile({ color, icon, title, value, hint }: { color: string; icon: React.ReactNode; title: string; value: string; hint: string }) {
  const colors: Record<string, string> = {
    emerald: "from-emerald-50 to-white border-emerald-200 text-emerald-700",
    teal: "from-teal-50 to-white border-teal-200 text-teal-700",
    sky: "from-sky-50 to-white border-sky-200 text-sky-700",
    fuchsia: "from-fuchsia-50 to-white border-fuchsia-200 text-fuchsia-700",
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-4 ${colors[color]}`}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span> {title}
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>
    </div>
  );
}


export default Route.component;
