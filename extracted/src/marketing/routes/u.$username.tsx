import { createFileRoute, Link, useParams } from "@/marketing/routerCompat";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Award,
  BadgeCheck,
  Copy,
  ExternalLink,
  Facebook,
  Loader2,
  MapPin,
  MessageCircle,
  Route as RouteIcon,
  Share2,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import {
  buildAchievementText,
  buildFacebookAchievement,
  buildProfileInviteUrl,
  buildProfileUrl,
  buildWhatsAppAchievement,
  fetchPublicProfileCard,
  type PublicProfileCard,
} from "@/marketing/lib/publicProfile";

export const Route = createFileRoute("/u/$username")({
  component: PublicProfilePage,
  head: () => ({
    meta: [
      { title: "كارت الإنجاز — مواصلات" },
      { name: "description", content: "صفحة عامة قابلة للمشاركة تعرض إنجازات المستخدم، عدد الناس اللي ساعدهم، البلاغات المفيدة، الرحلات المشتركة، ورابط الدعوة." },
    ],
  }),
});

function formatNumber(n: number) {
  return new Intl.NumberFormat("ar-EG").format(n || 0);
}

function PublicProfilePage() {
  const params = useParams();
  const username = String(params.username || "").toLowerCase();
  const [profile, setProfile] = useState<PublicProfileCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPublicProfileCard(username)
      .then((row) => { if (!cancelled) setProfile(row); })
      .catch((e) => { if (!cancelled) setError(e?.message || "تعذر تحميل البروفايل"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [username]);

  const shareText = useMemo(() => profile ? buildAchievementText(profile) : "", [profile]);
  const profileUrl = profile ? buildProfileUrl(profile.public_slug) : "";
  const inviteUrl = profile ? buildProfileInviteUrl(profile) : "";

  async function copyAchievement() {
    if (!profile) return;
    try {
      await navigator.clipboard.writeText(`${shareText}\n\nكارت الإنجاز: ${profileUrl}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  async function nativeShare() {
    if (!profile) return;
    if (navigator.share) {
      await navigator.share({
        title: `إنجاز ${profile.display_name} على مواصلات`,
        text: shareText,
        url: profileUrl,
      });
    } else {
      await copyAchievement();
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-amber-50 via-background to-background">
      <header className="border-b bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/leaderboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowRight className="h-4 w-4" />
            أبطال المناطق
          </Link>
          <Link to="/marketing" className="text-sm font-bold text-amber-700 hover:text-amber-800">
            مواصلات
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-200 bg-white p-8 text-center text-rose-700">{error}</div>
        ) : !profile ? (
          <div className="rounded-3xl border border-dashed bg-white p-8 text-center">
            <h1 className="text-2xl font-black">البروفايل ده مش موجود</h1>
            <p className="mt-2 text-sm text-muted-foreground">تأكد من الرابط أو ارجع للـ leaderboard.</p>
            <Link to="/leaderboard" className="mt-5 inline-flex rounded-full bg-amber-600 px-5 py-2 text-sm font-bold text-white hover:bg-amber-700">
              شوف أبطال المناطق
            </Link>
          </div>
        ) : (
          <div className="space-y-5">
            <section className="overflow-hidden rounded-[2rem] border bg-white shadow-sm">
              <div className="bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 p-1">
                <div className="rounded-[1.8rem] bg-white/95 p-6 md:p-8">
                  <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-amber-100 text-amber-700 ring-4 ring-white">
                        <Trophy className="h-8 w-8" />
                      </div>
                      <div>
                        <p className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                          <Sparkles className="h-3.5 w-3.5" /> كارت إنجاز عام
                        </p>
                        <h1 className="mt-3 text-3xl font-black tracking-tight text-foreground md:text-5xl">
                          {profile.display_name}
                        </h1>
                        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
                          <BadgeCheck className="h-4 w-4" /> {profile.badge_label}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-3xl border bg-gradient-to-br from-amber-50 to-orange-50 p-4 text-center md:min-w-56">
                      <p className="text-xs font-bold text-amber-800">نقاط المساعدة</p>
                      <p className="mt-1 text-4xl font-black text-amber-700">{formatNumber(profile.points)}</p>
                      <p className="mt-1 text-xs text-amber-900/70">كل نقطة جاية من مساعدة حقيقية</p>
                    </div>
                  </div>

                  <div className="mt-7 rounded-3xl bg-slate-950 p-5 text-white shadow-inner">
                    <p className="text-sm text-white/60">الجملة الجاهزة للمشاركة</p>
                    <p className="mt-2 text-2xl font-black leading-relaxed md:text-3xl">
                      أنا ساعدت {formatNumber(profile.people_helped)} شخص يوصلوا أسرع هذا الأسبوع على مواصلات.
                    </p>
                    <p className="mt-3 text-sm leading-7 text-white/70">
                      شارك الكارت ده وخلي صحابك يعرفوا إنك {profile.badge_label} في منطقتك.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-3 md:grid-cols-4">
              <StatCard icon={<Users className="h-5 w-5" />} label="ناس ساعدهم" value={profile.people_helped} />
              <StatCard icon={<RouteIcon className="h-5 w-5" />} label="رحلات مشتركة" value={profile.shared_trips} />
              <StatCard icon={<Award className="h-5 w-5" />} label="بلاغات مفيدة" value={profile.useful_alerts} />
              <StatCard icon={<MessageCircle className="h-5 w-5" />} label="إجابات" value={profile.answered_questions} />
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border bg-white p-5 shadow-sm">
                <h2 className="inline-flex items-center gap-2 text-lg font-black"><MapPin className="h-5 w-5 text-amber-600" /> منطقته وخطه</h2>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="rounded-2xl bg-muted p-3"><span className="text-muted-foreground">المنطقة الأكثر نشاطًا: </span><b>{profile.favorite_area}</b></div>
                  <div className="rounded-2xl bg-muted p-3"><span className="text-muted-foreground">الخط المفضل: </span><b>{profile.favorite_line}</b></div>
                </div>
              </div>

              <div className="rounded-3xl border bg-white p-5 shadow-sm">
                <h2 className="inline-flex items-center gap-2 text-lg font-black"><Award className="h-5 w-5 text-amber-600" /> Badges</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">{profile.badge_label}</span>
                  {profile.latest_badges?.slice(0, 5).map((b) => (
                    <span key={b.key} className="rounded-full border bg-muted px-3 py-1 text-xs font-bold text-foreground">{b.label}</span>
                  ))}
                  {(!profile.latest_badges || profile.latest_badges.length === 0) && (
                    <span className="text-sm text-muted-foreground">أول badge جاي مع أول رحلة أو بلاغ مفيد.</span>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-black">شارك إنجازك وخلي الدعوة ليها سبب</h2>
                  <p className="mt-1 text-sm text-muted-foreground">الكارت ده بيحوّل المستخدم من “بعت invite” إلى “أنا ساعدت ناس فعلًا”.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={nativeShare} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
                    <Share2 className="h-4 w-4" /> شارك الكارت
                  </button>
                  <a href={buildWhatsAppAchievement(profile)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">
                    <MessageCircle className="h-4 w-4" /> واتساب
                  </a>
                  <a href={buildFacebookAchievement(profile)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
                    <Facebook className="h-4 w-4" /> فيسبوك
                  </a>
                  <button onClick={copyAchievement} className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold hover:bg-muted">
                    <Copy className="h-4 w-4" /> {copied ? "اتنسخ" : "انسخ النص"}
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border bg-muted/40 p-3">
                  <p className="text-xs font-bold text-muted-foreground">رابط البروفايل العام</p>
                  <a href={profileUrl} className="mt-1 inline-flex items-center gap-1 break-all text-sm font-bold text-amber-700 hover:underline">
                    {profileUrl} <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
                <div className="rounded-2xl border bg-muted/40 p-3">
                  <p className="text-xs font-bold text-muted-foreground">Referral link</p>
                  <a href={inviteUrl} className="mt-1 inline-flex items-center gap-1 break-all text-sm font-bold text-amber-700 hover:underline">
                    {inviteUrl} <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-amber-700">{icon}<span className="text-xs font-bold">{label}</span></div>
      <p className="mt-3 text-3xl font-black text-foreground">{formatNumber(value)}</p>
    </div>
  );
}

export default Route.component;
