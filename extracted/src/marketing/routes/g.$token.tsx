import { createFileRoute, Link, useRouter } from "@/marketing/routerCompat";
import { useCallback, useEffect, useState } from "react";
import { Loader2, MapPin, Clock, Users, Share2, CheckCircle2, ArrowRight, Bus, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/marketing/hooks/useAuth";
import {
  fetchPublicGroupTrip, fetchPublicGroupJoins, joinGroupTrip,
  buildGroupTripUrl, buildWhatsAppShare,
  type PublicGroupTrip, type GroupJoin,
} from "@/marketing/lib/groupTrips";
import { shareStoryCard } from "@/marketing/lib/storyCard";
import { buildOgImageUrl, setShareMeta } from "@/marketing/lib/openGraph";

export const Route = createFileRoute("/g/$token")({
  component: GroupTripPage,
  head: () => ({
    meta: [
      { title: "رحلة جماعية — مواصلات" },
      { name: "description", content: "اضغط 'أنا كمان' لو معاهم في الرحلة" },
    ],
  }),
});

function GroupTripPage() {
  const { token } = Route.useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [trip, setTrip] = useState<PublicGroupTrip | null>(null);
  const [joins, setJoins] = useState<GroupJoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [t, j] = await Promise.all([fetchPublicGroupTrip(token), fetchPublicGroupJoins(token)]);
      if (!t) { setNotFound(true); return; }
      setTrip(t); setJoins(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذر تحميل الرحلة");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (!trip) return;
    const when = new Date(trip.depart_at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
    setShareMeta({
      title: trip.title,
      description: `${trip.joins_count} راكب ماشيين سوا — ${trip.from_location} إلى ${trip.to_location} — ${when}.`,
      image: buildOgImageUrl("g", token),
      url: window.location.href,
    });
  }, [trip, token]);

  const url = buildGroupTripUrl(token);
  const alreadyJoined = !!user && joins.some(() => false /* server has the check; we just track via reload */);
  const iAmIn = !!user && trip && joins.some((j) => j.display_name && false); // visual flag handled by reload count below
  void alreadyJoined; void iAmIn;

  const onJoin = async () => {
    if (!user) { router.navigate({ to: "/login", search: { redirect: `/g/${token}` } as never }); return; }
    setBusy(true); setErr(null);
    try { await joinGroupTrip(token); await reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : "تعذر الانضمام"); }
    finally { setBusy(false); }
  };

  const onShare = () => {
    if (!trip) return;
    window.open(buildWhatsAppShare(trip, url), "_blank");
  };

  const onStory = () => {
    if (!trip) return;
    const when = new Date(trip.depart_at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
    shareStoryCard({
      template: "arrived",
      title: trip.title,
      subtitle: `${trip.from_location} ← ${trip.to_location}`,
      emoji: "🚌",
      meta: [`⏰ ${when}`, `${trip.joins_count} ماشيين سوا`],
      cta: "أنا كمان — wsel.app",
    });
  };

  if (loading || authLoading) {
    return <CenterLoader />;
  }
  if (notFound) {
    return (
      <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center gap-3 text-slate-600">
        <AlertCircle className="h-10 w-10 text-rose-400" />
        <p>الرحلة دي مش موجودة أو اللينك غلط</p>
        <Link to="/"><Button variant="outline">رجوع للرئيسية</Button></Link>
      </div>
    );
  }
  if (!trip) return null;

  const when = new Date(trip.depart_at);
  const whenStr = when.toLocaleString("ar-EG", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const isPast = when.getTime() < Date.now();

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-violet-50 via-white to-sky-50">
      <header className="border-b bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-slate-700"><ArrowRight className="h-4 w-4" /> الرئيسية</Link>
          <h1 className="font-bold text-slate-900 text-sm">رحلة جماعية</h1>
          <div className="w-12" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 space-y-4">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-fuchsia-500 to-sky-500 p-6 text-white shadow-xl">
          <div className="absolute -top-10 -left-10 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-12 -right-8 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <div className="text-xs opacity-80">من تنظيم {trip.creator_name}</div>
            <h2 className="mt-1 text-2xl font-extrabold leading-tight">{trip.title}</h2>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" /> {trip.from_location} ← {trip.to_location}</span>
              <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" /> {whenStr}</span>
              {trip.transport && <span className="inline-flex items-center gap-1"><Bus className="h-4 w-4" /> {trip.transport}</span>}
            </div>
            {trip.notes && <p className="mt-3 text-sm/relaxed text-white/90 bg-white/10 rounded-xl p-3">{trip.notes}</p>}
            <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold bg-white/15 rounded-full px-3 py-1">
              <Users className="h-4 w-4" /> {trip.joins_count} حد ماشي معاه
            </div>
          </div>
        </div>

        {/* Actions */}
        {trip.is_closed || isPast ? (
          <div className="rounded-2xl border bg-amber-50 border-amber-200 text-amber-900 p-4 text-sm text-center">
            الرحلة دي خلصت أو اتقفلت 🚪
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button onClick={onJoin} disabled={busy} size="lg" className="gap-2 bg-violet-600 hover:bg-violet-700">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              أنا كمان 🙋
            </Button>
            <Button onClick={onShare} variant="outline" size="lg" className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
              <Share2 className="h-4 w-4" /> شيّر واتساب
            </Button>
            <Button onClick={onStory} variant="outline" size="lg" className="gap-2 border-violet-300 text-violet-700 hover:bg-violet-50">
              📸 ستوري
            </Button>
          </div>
        )}
        {err && <p className="text-sm text-rose-600 text-center">{err}</p>}

        {/* Joins list */}
        <div className="rounded-2xl border bg-white p-4">
          <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-violet-600" /> الفريق ({joins.length})
          </h3>
          {joins.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">لسه محدش انضم — كن أنت الأول 🚀</p>
          ) : (
            <ul className="space-y-2">
              {joins.map((j, i) => (
                <li key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50">
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-500 text-white flex items-center justify-center font-bold text-sm">
                    {j.display_name.slice(0, 2)}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-900">{j.display_name}</div>
                    <div className="text-[11px] text-slate-500">
                      انضم {new Date(j.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-center text-xs text-slate-500">
          عايز تعمل رحلتك الخاصة؟ <Link to="/group/new" className="text-violet-700 font-semibold underline">ابدأ من هنا</Link>
        </p>
      </main>
    </div>
  );
}

function CenterLoader() {
  return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-violet-500" /></div>;
}


export default Route.component;
