import { createFileRoute, Link, useParams } from "@/marketing/routerCompat";
import { useEffect, useState } from "react";
import { ArrowLeft, Bus, Clock, Copy, Loader2, MessageCircle, Mic, MapPin, Navigation, RefreshCw, Send, Share2, ShieldCheck, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dataClient } from "@/marketing/integrations/data/client";
import { getSharedTrip, getSharedTripPings, type SharedTrip } from "@/marketing/lib/trips";
import { askLiveRider } from "@/marketing/lib/liveQuestions";
import { buildOgImageUrl, setShareMeta } from "@/marketing/lib/openGraph";
import { useAuth } from "@/marketing/hooks/useAuth";
import { trackGrowthEvent } from "@/marketing/lib/growth";
import { InteractiveTripMap, type TripMapPoint } from "@/marketing/components/InteractiveTripMap";

export const Route = createFileRoute("/t/$token")({
  component: SharedTripPage,
  head: () => ({
    meta: [
      { title: "تتبع رحلة لايف 🚌" },
      { name: "description", content: "تابع موقع الرحلة لحظة بلحظة" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function buildTripShareUrl(token: string): string {
  if (typeof window === "undefined") return `/t/${token}`;
  const url = new URL(`/t/${token}`, window.location.origin);
  url.searchParams.set("src", "whatsapp");
  return url.toString();
}

function buildTripShareText(trip: SharedTrip, token: string): string {
  const url = buildTripShareUrl(token);
  return [
    `أنا متابع مشوار من ${trip.from_location} لـ ${trip.to_location}.`,
    `مواصلات بتعرض الطريق والموقع والتحديثات لايف من غير تسجيل.`,
    trip.transport ? `المواصلة: ${trip.transport}` : `افتح اللينك وشوف المشوار بنفسك.`,
    `ابعت الجروب يشوفوا الطريق:`,
    url,
  ].filter(Boolean).join("\n");
}

function buildTripWhatsAppUrl(trip: SharedTrip, token: string): string {
  return `https://wa.me/?text=${encodeURIComponent(buildTripShareText(trip, token))}`;
}

function SharedTripPage() {
  const params = useParams({ from: "/t/$token" });
  const token = String(params.token || "");
  const { user } = useAuth();
  const [trip, setTrip] = useState<SharedTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showAsk, setShowAsk] = useState(false);
  const [askText, setAskText] = useState("");
  const [asking, setAsking] = useState(false);
  const [asked, setAsked] = useState(false);
  const [pings, setPings] = useState<TripMapPoint[]>([]);

  const submitAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trip || !askText.trim()) return;
    setAsking(true);
    try {
      await askLiveRider(trip.id, askText);
      setAsked(true); setAskText(""); setShowAsk(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "خطأ");
    } finally { setAsking(false); }
  };

  const load = async () => {
    try {
      const t = await getSharedTrip(token);
      setTrip(t);
      if (!t) {
        setErr("الرحلة دي مش موجودة أو اللينك غلط");
        setPings([]);
        return;
      }
      const recentPings = await getSharedTripPings(token, 80);
      setPings(recentPings.map((p) => ({ lat: p.lat, lng: p.lng, created_at: p.created_at })));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطأ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const id = setInterval(() => { void load(); }, 15_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Realtime: subscribe to the specific trip row changes (works for public via RLS-bypassing RPC fallback by polling)
  useEffect(() => {
    if (!trip?.id) return;
    const ch = dataClient
      .channel(`trip-${trip.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "trips", filter: `id=eq.${trip.id}` }, () => {
        void load();
      })
      .subscribe();
    return () => { void dataClient.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id]);

  useEffect(() => {
    if (!trip) return;
    const title = `أسرع متابعة لمشوار ${trip.from_location} → ${trip.to_location}`;
    const description = `${trip.transport ?? "مواصلات"} — افتح اللينك وشوف الطريق والتحديثات لايف بدون تسجيل.`;
    setShareMeta({ title, description, image: buildOgImageUrl("t", token), url: window.location.href });
  }, [trip, token]);

  useEffect(() => {
    if (!trip) return;
    void trackGrowthEvent("shared_route_opened", {
      token,
      from: trip.from_location,
      to: trip.to_location,
      transport: trip.transport ?? null,
      status: trip.status,
      source: new URLSearchParams(window.location.search).get("src") ?? "direct",
    });
  }, [trip?.id, token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (err || !trip) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center" dir="rtl">
        <p className="text-slate-700">{err ?? "لا توجد بيانات"}</p>
        <Link to="/"><Button variant="outline">الصفحة الرئيسية</Button></Link>
      </div>
    );
  }

  const isLive = trip.status === "active";
  const hasLoc = trip.last_lat != null && trip.last_lng != null;
  const minsAgo = trip.last_ping_at
    ? Math.max(0, Math.round((Date.now() - new Date(trip.last_ping_at).getTime()) / 60000))
    : null;

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-emerald-500 p-2 text-white"><Navigation className="h-4 w-4" /></div>
            <div>
              <h1 className="text-sm font-bold text-slate-900">تتبع رحلة لايف</h1>
              <p className="text-[10px] text-slate-500">{trip.owner_name ?? "مستخدم"}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void load()}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <div className={`rounded-2xl border p-5 ${isLive ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
          <div className="flex items-center gap-2">
            {isLive ? (
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
              </span>
            ) : (
              <span className="h-3 w-3 rounded-full bg-slate-400" />
            )}
            <h2 className={`text-base font-bold ${isLive ? "text-emerald-900" : "text-slate-800"}`}>
              {isLive ? "الرحلة شغّالة دلوقتي" : "الرحلة انتهت"}
            </h2>
          </div>

          <div className="mt-3 space-y-2 text-sm text-slate-800">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span><b>من:</b> {trip.from_location}</span>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <span><b>إلى:</b> {trip.to_location}</span>
            </div>
            {trip.transport && (
              <div className="flex items-start gap-2">
                <Bus className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                <span>{trip.transport}</span>
              </div>
            )}
            {trip.notes && (
              <p className="rounded-md bg-white/60 p-2 text-xs text-slate-600">📝 {trip.notes}</p>
            )}
          </div>
        </div>

        <section className="overflow-hidden rounded-3xl border bg-white shadow-sm">
          <div className="bg-gradient-to-br from-sky-950 via-blue-800 to-emerald-700 p-5 text-white">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-black backdrop-blur">
              <Share2 className="h-3.5 w-3.5" /> Route share public
            </div>
            <h2 className="mt-4 text-3xl font-black leading-tight">شوف الطريق لايف قبل ما تتحرك.</h2>
            <p className="mt-2 text-sm leading-7 text-white/85">
              صفحة عامة من غير login: منين، لفين، آخر تحديث، وزر واتساب جاهز للجروب.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-2xl bg-white/12 p-3 backdrop-blur"><Clock className="mx-auto mb-1 h-4 w-4" />تحديث لايف</div>
              <div className="rounded-2xl bg-white/12 p-3 backdrop-blur"><WalletCards className="mx-auto mb-1 h-4 w-4" />معلومة واضحة</div>
              <div className="rounded-2xl bg-white/12 p-3 backdrop-blur"><ShieldCheck className="mx-auto mb-1 h-4 w-4" />مناسب للمشاركة</div>
            </div>
          </div>
          <div className="space-y-3 p-4">
            <a
              href={buildTripWhatsAppUrl(trip, token)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 py-3 text-sm font-black text-white hover:opacity-90"
            >
              <MessageCircle className="h-5 w-5" /> ابعت الجروب يشوفوا الطريق
            </a>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(buildTripShareText(trip, token))}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-black text-slate-800 hover:bg-slate-50"
            >
              <Copy className="h-4 w-4" /> انسخ نص المشاركة
            </button>
            <p className="rounded-2xl bg-emerald-50 p-3 text-xs font-bold leading-6 text-emerald-900">
              المعاينة على واتساب بتظهر بصورة route ديناميكية، واللينك يفتح نفس الصفحة مباشرة بدون تسجيل.
            </p>
          </div>
        </section>

        <InteractiveTripMap
          lastLat={trip.last_lat}
          lastLng={trip.last_lng}
          lastPingAt={trip.last_ping_at}
          pings={pings}
          fromLabel={trip.from_location}
          toLabel={trip.to_location}
          status={trip.status}
        />

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900">آخر تحديث موقع</h3>
          {hasLoc ? (
            <p className="mt-1 text-xs text-slate-600">
              {minsAgo === 0 ? "تحديث قبل ثوانٍ" : `قبل ${minsAgo} دقيقة`} · الخريطة أعلاه تفاعلية بدون Google Maps.
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">لسه مفيش تحديث موقع — استنى شوية.</p>
          )}
        </div>

        {/* Ask the live rider */}
        {trip.status === "active" && (
          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
            {asked ? (
              <p className="text-sm font-semibold text-violet-900">✅ اتبعت سؤالك — هتلاقي الرد لما الراكب يرد.</p>
            ) : !user ? (
              <div className="text-center">
                <p className="mb-2 text-sm font-bold text-violet-900">🎙️ اسأل اللي راكب دلوقتي</p>
                <Link to="/login"><Button size="sm" className="bg-violet-600 hover:bg-violet-700">سجل دخول علشان تسأل</Button></Link>
              </div>
            ) : !showAsk ? (
              <Button onClick={() => setShowAsk(true)} className="w-full gap-2 bg-violet-600 hover:bg-violet-700">
                <Mic className="h-4 w-4" /> اسأل الراكب دلوقتي
              </Button>
            ) : (
              <form onSubmit={submitAsk} className="space-y-2">
                <p className="text-xs text-violet-900">سؤالك يوصله كإشعار. مثال: "المترو زحمة؟"</p>
                <div className="flex gap-2">
                  <input value={askText} onChange={(e) => setAskText(e.target.value)} maxLength={280}
                    placeholder="اكتب سؤالك…" className="flex-1 rounded-lg border px-3 py-2 text-sm" />
                  <Button type="submit" size="sm" disabled={asking || !askText.trim()} className="bg-violet-600 hover:bg-violet-700">
                    {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          ⚠️ ده تتبع مؤقت ينتهي لما صاحب الرحلة يأكد إنه وصل. لو محتاج تتأكد من سلامته، اتصل بيه مباشرة.
        </div>


        <div className="text-center">
          <Link to="/" className="text-xs text-slate-500 underline">
            <ArrowLeft className="ml-1 inline h-3 w-3" />
            اعمل رحلة بنفسك على المنصة
          </Link>
        </div>
      </main>
    </div>
  );
}


export default Route.component;
