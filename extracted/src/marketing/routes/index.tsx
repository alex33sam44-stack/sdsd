import { createFileRoute, Link } from "@/marketing/routerCompat";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { MapPin, Navigation, Bus, Loader2, AlertCircle, Sparkles, Plus, CheckCircle2, LogOut, ShieldCheck, MessageCircle, Trophy, Share2, AlertTriangle, Gift, Leaf, Users, Flame, Mic, Hash, CalendarClock, BarChart3 } from "lucide-react";
import { captureRefFromUrl } from "@/marketing/lib/referrals";
import { fetchNearbyStations, googleMapsDirUrl, haversineKm, type Station, type StationType } from "@/marketing/lib/stations";
import {
  fetchCommunityStations,
  fetchMyConfirmations,
  addStation,
  confirmStation,
  CONFIRMATIONS_REQUIRED,
  type CommunityStation,
} from "@/marketing/lib/community";
import { useAuth } from "@/marketing/hooks/useAuth";

const MwasalatMap = lazy(() =>
  import("@/marketing/components/MwasalatMap").then((m) => ({ default: m.MwasalatMap })),
);
import { Button } from "@/components/ui/button";
import { AREA_PAGES } from "@/marketing/lib/areas";
import { LAUNCH_CAMPAIGNS } from "@/marketing/lib/launchCampaigns";

type NearbyStation = (Station | CommunityStation) & { distanceKm: number };

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "مواصلات — اعرف تركب إيه قبل ما تنزل" },
      { name: "description", content: "اكتب منين ورايح فين، وشوف وقت الطريق والتكلفة والتبديلات والزحمة قبل ما تنزل. احسب طريقك الآن وشاركه مع صحابك." },
      { name: "theme-color", content: "#0ea5e9" },
    ],
    links: [{ rel: "manifest", href: "/manifest.webmanifest" }],
  }),
});

type GeoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; lat: number; lng: number; accuracy: number }
  | { status: "error"; message: string };

const TYPES: StationType[] = ["ميكروباص", "أتوبيس", "مترو", "ترام", "موقف"];

function Index() {
  const { user, signOut } = useAuth();
  const [geo, setGeo] = useState<GeoState>({ status: "idle" });
  const [fromPlace, setFromPlace] = useState("فيصل");
  const [toPlace, setToPlace] = useState("مدينة نصر");


  useEffect(() => { captureRefFromUrl(); }, []);


  const requestLocation = () => {
    if (!("geolocation" in navigator)) {
      setGeo({ status: "error", message: "جهازك مش بيدعم تحديد الموقع" });
      return;
    }
    setGeo({ status: "loading" });
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setGeo({
          status: "ok",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => {
        const messages: Record<number, string> = {
          1: "رفضت إذن الموقع — فعّله من إعدادات المتصفح",
          2: "تعذر الحصول على موقعك الحالي",
          3: "انتهت مهلة تحديد الموقع — جرّب تاني",
        };
        setGeo({ status: "error", message: messages[err.code] ?? err.message });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  };

  const [osm, setOsm] = useState<(Station & { distanceKm: number })[]>([]);
  const [community, setCommunity] = useState<CommunityStation[]>([]);
  const [myConfirms, setMyConfirms] = useState<Set<string>>(new Set());
  const [loadingStations, setLoadingStations] = useState(false);
  const [stationsError, setStationsError] = useState<string | null>(null);
  const [reloadCommunity, setReloadCommunity] = useState(0);

  // OSM nearby
  useEffect(() => {
    if (geo.status !== "ok") return;
    let cancelled = false;
    setLoadingStations(true);
    setStationsError(null);
    fetchNearbyStations({ lat: geo.lat, lng: geo.lng }, 2000, 20)
      .then((data) => { if (!cancelled) setOsm(data); })
      .catch((e) => { if (!cancelled) setStationsError(e?.message ?? "تعذر تحميل المحطات"); })
      .finally(() => { if (!cancelled) setLoadingStations(false); });
    return () => { cancelled = true; };
  }, [geo]);

  // Community stations from DB
  useEffect(() => {
    fetchCommunityStations().then(setCommunity).catch(() => {});
  }, [reloadCommunity]);

  // My confirmations
  useEffect(() => {
    if (!user) { setMyConfirms(new Set()); return; }
    fetchMyConfirmations(user.id).then(setMyConfirms).catch(() => {});
  }, [user, reloadCommunity]);

  // Merge + sort
  const nearest: NearbyStation[] = useMemo(() => {
    if (geo.status !== "ok") return [];
    const origin = { lat: geo.lat, lng: geo.lng };
    const communityWithDist = community.map((s) => ({ ...s, distanceKm: haversineKm(origin, s) }));
    const all: NearbyStation[] = [...osm, ...communityWithDist];
    return all.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 30);
  }, [geo, osm, community]);

  const openInMaps = (s: Station) => {
    const origin = geo.status === "ok" ? { lat: geo.lat, lng: geo.lng } : undefined;
    window.open(googleMapsDirUrl({ lat: s.lat, lng: s.lng }, origin), "_blank");
  };

  // Add station form
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", type: "ميكروباص" as StationType, lines: "" });
  const [adding, setAdding] = useState(false);

  const landingRouteUrl = `/planner?from=${encodeURIComponent(fromPlace.trim() || "فيصل")}&to=${encodeURIComponent(toPlace.trim() || "مدينة نصر")}&src=marketing`;


  const submitStation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || geo.status !== "ok") return;
    setAdding(true);
    try {
      await addStation({
        user_id: user.id,
        name: form.name.trim(),
        type: form.type,
        lines: form.lines.split(/[،,]/).map((s) => s.trim()).filter(Boolean).slice(0, 10),
        lat: geo.lat,
        lng: geo.lng,
      });
      setShowAdd(false);
      setForm({ name: "", type: "ميكروباص", lines: "" });
      setReloadCommunity((n) => n + 1);
    } catch (err: any) {
      alert(err?.message ?? "تعذر إضافة المحطة");
    } finally {
      setAdding(false);
    }
  };

  const confirm = async (dbId: string) => {
    if (!user) return;
    try {
      await confirmStation(dbId, user.id);
      setReloadCommunity((n) => n + 1);
    } catch (err: any) {
      alert(err?.message ?? "تعذر التأكيد");
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-sky-50 to-white">
      {/* Header */}
      <header className="sticky top-0 z-[1000] border-b bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-sky-500 p-2 text-white"><Bus className="h-5 w-5" /></div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">مواصلات</h1>
              <p className="text-[10px] text-slate-500">اعرف الطريق واكسب اسم في منطقتك</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">

            <Link to="/daily">
              <Button size="sm" className="gap-1 bg-amber-400 text-slate-950 hover:bg-amber-300">
                <CalendarClock className="h-4 w-4" /> <span className="hidden sm:inline">خطي اليومي</span>
              </Button>
            </Link>
            <Link to="/growth">
              <Button size="sm" variant="outline" className="gap-1 border-sky-200 text-sky-700 hover:bg-sky-50">
                <BarChart3 className="h-4 w-4" /> <span className="hidden lg:inline">Growth</span>
              </Button>
            </Link>
            <Link to="/alerts">
              <Button size="sm" variant="outline" className="gap-1 border-rose-200 text-rose-700 hover:bg-rose-50">
                <AlertTriangle className="h-4 w-4" /> <span className="hidden sm:inline">بلاغات</span>
              </Button>
            </Link>
            <Link to="/trip">
              <Button size="sm" className="gap-1 bg-emerald-500 hover:bg-emerald-600">
                <Share2 className="h-4 w-4" /> <span className="hidden sm:inline">شيّر رحلتك</span>
              </Button>
            </Link>
            <Link to="/channels">
              <Button size="sm" variant="outline" className="gap-1">
                <Hash className="h-4 w-4" /> <span className="hidden md:inline">قنوات</span>
              </Button>
            </Link>
            <Link to="/heatmap">
              <Button size="sm" variant="ghost" className="gap-1" aria-label="نبض القاهرة">
                <Flame className="h-4 w-4 text-orange-500" />
              </Button>
            </Link>
            {user && (
              <Link to="/inbox">
                <Button size="sm" variant="ghost" className="gap-1" aria-label="أسئلة موجهة ليك">
                  <Mic className="h-4 w-4 text-violet-600" />
                </Button>
              </Link>
            )}
            <Link to="/chat">
              <Button size="sm" variant="outline" className="gap-1">
                <MessageCircle className="h-4 w-4" /> <span className="hidden md:inline">اسأل المجتمع</span>
              </Button>
            </Link>
            {user && (
              <Link to="/group/new">
                <Button size="sm" variant="ghost" className="gap-1" aria-label="رحلة جماعية">
                  <Users className="h-4 w-4 text-violet-600" />
                </Button>
              </Link>
            )}
            {user && (
              <Link to="/savings">
                <Button size="sm" variant="ghost" className="gap-1" aria-label="وفّرت كذا">
                  <Leaf className="h-4 w-4 text-emerald-600" />
                </Button>
              </Link>
            )}
            {user && (
              <Link to="/invite">
                <Button size="sm" variant="ghost" className="gap-1" aria-label="ادعِ صحابك">
                  <Gift className="h-4 w-4 text-fuchsia-500" />
                </Button>
              </Link>
            )}
            <Link to="/leaderboard">
              <Button size="sm" variant="ghost" className="gap-1" aria-label="المتصدرون">
                <Trophy className="h-4 w-4 text-amber-500" />
              </Button>
            </Link>
            {user ? (
              <Button variant="ghost" size="sm" onClick={signOut} aria-label="خروج"><LogOut className="h-4 w-4" /></Button>
            ) : (
              <Link to="/login">
                <Button size="sm" variant="outline">دخول</Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 space-y-4">
        {/* Conversion-first landing */}
        <section className="overflow-hidden rounded-[2rem] border bg-slate-950 text-white shadow-xl">
          <div className="grid gap-6 p-5 md:grid-cols-[1.05fr_0.95fr] md:p-8">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1 text-xs font-black text-amber-200">
                <Sparkles className="h-3.5 w-3.5" /> قبل ما تنزل
              </div>

              <div className="space-y-3">
                <h2 className="text-4xl font-black leading-tight tracking-tight md:text-6xl">
                  اعرف تركب إيه قبل ما تنزل.
                </h2>
                <p className="max-w-xl text-base leading-8 text-slate-300 md:text-lg">
                  اكتب منين ورايح فين، وخد تقدير سريع للوقت، التكلفة، التبديلات، والزحمة — وبعدها ابعت الطريق للجروب.
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white p-3 text-slate-950 shadow-2xl">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs font-black text-slate-500">منين؟</span>
                    <input
                      value={fromPlace}
                      onChange={(e) => setFromPlace(e.target.value)}
                      placeholder="مثال: فيصل"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-bold outline-none focus:border-sky-500 focus:bg-white"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-black text-slate-500">رايح فين؟</span>
                    <input
                      value={toPlace}
                      onChange={(e) => setToPlace(e.target.value)}
                      placeholder="مثال: مدينة نصر"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-bold outline-none focus:border-sky-500 focus:bg-white"
                    />
                  </label>
                </div>
                <a href={landingRouteUrl}>
                  <Button size="lg" className="mt-3 w-full rounded-2xl bg-sky-600 text-base font-black hover:bg-sky-700">
                    احسب طريقي الآن
                  </Button>
                </a>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-emerald-400 px-3 py-1 font-black text-emerald-950">+10,000 رحلة محسوبة هذا الأسبوع</span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-slate-200">بلاغات زحمة من المجتمع</span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-slate-200">مشاركة واتساب بضغطة</span>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-white/10 p-4 shadow-inner backdrop-blur">
              <div className="rounded-3xl bg-white p-4 text-slate-950 shadow-2xl">
                <div className="flex items-center justify-between gap-3 border-b pb-3">
                  <div>
                    <p className="text-xs font-black text-slate-500">نتيجة تجريبية فورية</p>
                    <p className="mt-1 text-xl font-black">{fromPlace || "فيصل"} → {toPlace || "مدينة نصر"}</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">موصى به</span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-2xl bg-sky-50 p-3">
                    <p className="text-xs font-bold text-sky-700">الوقت</p>
                    <p className="mt-1 text-2xl font-black text-slate-950">34 دقيقة</p>
                  </div>
                  <div className="rounded-2xl bg-amber-50 p-3">
                    <p className="text-xs font-bold text-amber-700">التكلفة</p>
                    <p className="mt-1 text-2xl font-black text-slate-950">18 جنيه</p>
                  </div>
                  <div className="rounded-2xl bg-violet-50 p-3">
                    <p className="text-xs font-bold text-violet-700">التبديلات</p>
                    <p className="mt-1 text-2xl font-black text-slate-950">2</p>
                  </div>
                  <div className="rounded-2xl bg-rose-50 p-3">
                    <p className="text-xs font-bold text-rose-700">الزحمة</p>
                    <p className="mt-1 text-2xl font-black text-slate-950">متوسطة</p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl bg-slate-950 p-4 text-white">
                  <p className="text-sm font-black">نص جاهز للجروب</p>
                  <p className="mt-2 text-sm leading-7 text-slate-300">
                    أنا رايح من {fromPlace || "فيصل"} لـ {toPlace || "مدينة نصر"}. مواصلات حسبتلي الطريق والتكلفة والزحمة. شوف الطريق هنا.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Simple value cards */}
        <section className="grid gap-3 md:grid-cols-4">
          {[
            ["وفر فلوس", "اعرف التكلفة المتوقعة قبل ما تركب.", "bg-emerald-50 text-emerald-900"],
            ["تجنب الزحمة", "شوف بلاغات الناس حوالين خطك.", "bg-rose-50 text-rose-900"],
            ["شارك مشوارك", "ابعت route أو trip للجروب بضغطة.", "bg-sky-50 text-sky-900"],
            ["اسأل الناس على الخط", "حد رايح رمسيس؟ سالك ولا واقف؟", "bg-violet-50 text-violet-900"],
          ].map(([title, body, cls]) => (
            <div key={title} className={`rounded-3xl border p-4 shadow-sm ${cls}`}>
              <p className="text-lg font-black">{title}</p>
              <p className="mt-2 text-sm leading-6 opacity-80">{body}</p>
            </div>
          ))}
        </section>

        {/* Focused launch campaigns */}
        <section className="rounded-[2rem] border bg-slate-950 p-5 text-white shadow-xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-amber-300">حملات إطلاق موجهة</p>
              <h2 className="mt-1 text-3xl font-black">ابدأ بخط ومنطقة فيها ألم يومي واضح.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-300">
                بدل ما نبدأ بكل مصر، نبدأ بطلاب جامعة + موظفين + خطوط مزدحمة. كل حملة لها رسالة، routes ساخنة، ودعوة واتساب لجروب نفس المنطقة.
              </p>
            </div>
            <Link to="/cairo-university">
              <Button className="gap-2 bg-amber-400 text-slate-950 hover:bg-amber-300">
                <Users className="h-4 w-4" /> حملة جامعة القاهرة
              </Button>
            </Link>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {LAUNCH_CAMPAIGNS.map((campaign) => (
              <Link key={campaign.slug} to={campaign.path} className="rounded-3xl border border-white/10 bg-white/10 p-4 transition hover:-translate-y-0.5 hover:bg-white/15 hover:shadow-lg">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-amber-300 px-3 py-1 text-xs font-black text-slate-950">{campaign.name}</span>
                  <span className="text-[11px] font-bold text-slate-300">Pilot</span>
                </div>
                <p className="mt-3 text-lg font-black leading-7">{campaign.headline}</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{campaign.audience}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold">
                  <span className="rounded-full bg-white/10 px-2 py-1 text-amber-100">{campaign.heroMinutes} دقيقة</span>
                  <span className="rounded-full bg-white/10 px-2 py-1 text-emerald-100">{campaign.heroFare} جنيه</span>
                  <span className="rounded-full bg-white/10 px-2 py-1 text-rose-100">زحمة {campaign.traffic}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Local challenges */}
        <section className="rounded-[2rem] border bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-amber-600">تحديات محلية</p>
              <h2 className="mt-1 text-3xl font-black text-slate-950">خلي منطقتك تظهر على الخريطة.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
                ادخل تحدي منطقتك، شوف أكثر routes بحثًا، آخر البلاغات، ومين أكثر ناس ساعدت الركاب حوالينك.
              </p>
            </div>
            <Link to="/areas/faisal">
              <Button variant="outline" className="gap-2 bg-white">
                <MapPin className="h-4 w-4" /> شوف تحدي فيصل
              </Button>
            </Link>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {AREA_PAGES.map((area) => (
              <Link key={area.slug} to={`/areas/${area.slug}`} className="rounded-3xl border bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:bg-amber-50 hover:shadow-md">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">{area.name}</span>
                  <span className="text-xs font-bold text-slate-500">{area.memberCount.toLocaleString("ar-EG")} عضو</span>
                </div>
                <p className="mt-3 text-lg font-black text-slate-950">{area.headline}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">أكثر route بحثًا: {area.topRoute}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold">
                  <span className="rounded-full bg-white px-2 py-1 text-slate-700">{area.weeklySearches.toLocaleString("ar-EG")} بحث</span>
                  <span className="rounded-full bg-white px-2 py-1 text-rose-700">{area.activeReports} بلاغ</span>
                  <span className="rounded-full bg-white px-2 py-1 text-emerald-700">تحدي أسبوعي</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Social invite CTA */}
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-2xl font-black text-slate-950">ادعُ صحابك على نفس الخط.</p>
              <p className="mt-1 text-sm leading-7 text-slate-600">كل ما أصحابك يستخدموا نفس الطريق، البلاغات تبقى أقوى، والبدائل تبقى أوضح، وإنت تكسب نقاط وظهور في منطقتك.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link to="/invite">
                <Button size="lg" className="w-full gap-2 bg-fuchsia-600 hover:bg-fuchsia-700 sm:w-auto">
                  <Gift className="h-4 w-4" /> ادعُ صحابك
                </Button>
              </Link>
              <Link to="/chat">
                <Button size="lg" variant="outline" className="w-full gap-2 bg-white sm:w-auto">
                  <MessageCircle className="h-4 w-4" /> اسأل أهل الخط
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* CTA */}
        {geo.status === "idle" && (
          <div className="rounded-2xl border bg-white p-6 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-sky-100">
              <MapPin className="h-7 w-7 text-sky-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">ابدأ من مكانك الحالي</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
              هنحدد أقرب محطات وخيارات ركوب حوالينك، وبعدها تقدر تضيف محطة أو تشارك رحلتك مع صحابك.
            </p>
            <Button size="lg" onClick={requestLocation} className="mt-6 bg-sky-600 hover:bg-sky-700">
              <Navigation className="ml-2 h-4 w-4" /> شوف أركب إيه دلوقتي
            </Button>
          </div>
        )}

        {geo.status === "loading" && (
          <div className="rounded-2xl border bg-white p-12 text-center shadow-sm">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600" />
            <p className="mt-3 text-sm text-slate-600">جاري تحديد موقعك…</p>
          </div>
        )}

        {geo.status === "error" && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <div className="flex-1">
                <p className="font-semibold text-red-900">تعذر تحديد الموقع</p>
                <p className="mt-1 text-sm text-red-700">{geo.message}</p>
                <Button onClick={requestLocation} variant="outline" size="sm" className="mt-3">حاول مرة أخرى</Button>
              </div>
            </div>
          </div>
        )}

        {geo.status === "ok" && (
          <>
            {/* الخريطة */}
            <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
              <div className="h-[420px] w-full">
                <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-sky-600" /></div>}>
                  <MwasalatMap user={{ lat: geo.lat, lng: geo.lng }} stations={nearest} onNavigate={openInMaps} />
                </Suspense>
              </div>
              <div className="flex items-center justify-between border-t bg-slate-50 px-4 py-2 text-xs text-slate-600">
                <span>دقة ±{Math.round(geo.accuracy)} م</span>
                <button onClick={requestLocation} className="font-medium text-sky-600 hover:underline">تحديث الموقع</button>
              </div>
            </div>

            {/* زرار إضافة محطة في موقعي */}
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              {!showAdd ? (
                <Button
                  onClick={() => {
                    if (!user) { window.location.href = "/login"; return; }
                    setShowAdd(true);
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  <Plus className="ml-2 h-4 w-4" />
                  أضف محطة في موقعي الحالي
                </Button>
              ) : (
                <form onSubmit={submitStation} className="space-y-3">
                  <p className="text-sm font-bold text-slate-900">محطة جديدة في موقعك الحالي</p>
                  <input
                    required minLength={2} maxLength={120}
                    placeholder="اسم المحطة (مثال: موقف رمسيس)"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-sky-500"
                  />
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as StationType })}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-sky-500"
                  >
                    {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input
                    placeholder="الخطوط (افصل بفاصلة) — مثال: العتبة، رمسيس، التحرير"
                    value={form.lines}
                    onChange={(e) => setForm({ ...form, lines: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-sky-500"
                  />
                  <div className="flex gap-2">
                    <Button type="submit" disabled={adding} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                      {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>إلغاء</Button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    هتظهر للكل بعد ما {CONFIRMATIONS_REQUIRED} مستخدمين تانيين يأكدوها
                  </p>
                </form>
              )}
            </div>

            {/* قائمة أقرب المحطات */}
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <h3 className="mb-3 font-bold text-slate-900">
                أقرب المحطات ليك {nearest.length > 0 && <span className="text-xs font-normal text-slate-500">({nearest.length})</span>}
              </h3>
              {loadingStations && (
                <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> جاري سحب المحطات…
                </div>
              )}
              {stationsError && !loadingStations && nearest.length === 0 && (
                <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{stationsError}</div>
              )}
              {nearest.length > 0 && (
                <ul className="divide-y">
                  {nearest.map((s, i) => {
                    const isComm = "isCommunity" in s;
                    const dbId = isComm ? s.id.replace(/^c:/, "") : null;
                    const confirmed = isComm && s.confirmations_count >= CONFIRMATIONS_REQUIRED;
                    const pending = isComm && !confirmed;
                    const isMine = isComm && user && s.user_id === user.id;
                    const alreadyConfirmed = dbId ? myConfirms.has(dbId) : false;
                    return (
                      <li key={s.id} className="flex items-center gap-3 py-3">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${pending ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"}`}>
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-semibold text-slate-900">{s.name}</p>
                            {pending && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">قيد التأكيد ({s.confirmations_count}/{CONFIRMATIONS_REQUIRED})</span>}
                            {confirmed && isComm && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">مؤكدة من المجتمع</span>}
                          </div>
                          <p className="truncate text-xs text-slate-500">
                            {s.type}{s.lines.length > 0 && ` • ${s.lines.join("، ")}`}
                          </p>
                        </div>
                        <div className="text-left space-y-1">
                          <p className="text-sm font-bold text-slate-900">
                            {s.distanceKm < 1 ? `${Math.round(s.distanceKm * 1000)} م` : `${s.distanceKm.toFixed(2)} كم`}
                          </p>
                          {isComm && dbId && user && !isMine && !alreadyConfirmed && (
                            <button onClick={() => confirm(dbId)} className="text-[11px] font-semibold text-emerald-600 hover:underline">
                              <CheckCircle2 className="inline h-3 w-3" /> أكّد
                            </button>
                          )}
                          {alreadyConfirmed && <p className="text-[10px] text-emerald-600">✓ أكدت</p>}
                          <button onClick={() => openInMaps(s)} className="block text-xs font-semibold text-sky-600 hover:underline">
                            خرائط ←
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {!loadingStations && nearest.length === 0 && (
                <p className="py-6 text-center text-xs text-slate-500">مفيش محطات قريبة. كن أول واحد يضيف!</p>
              )}
            </div>

            {/* شرح ليه ده مجاني */}
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="font-bold flex items-center gap-1"><Sparkles className="h-4 w-4" /> ليه ده شغّال بصفر تكلفة؟</p>
              <ul className="mt-2 space-y-1 text-xs leading-relaxed text-emerald-800">
                <li>• <b>GPS</b> من المتصفح مباشرة</li>
                <li>• <b>محطات OpenStreetMap</b> مجاناً عبر Overpass</li>
                <li>• <b>محطات المجتمع</b> بيضيفها المستخدمين ويأكدوها بعض</li>
                <li>• <b>MapLibre + PMTiles</b> خريطة تفاعلية من CDN بدون Google Maps</li>
              </ul>
            </div>
          </>
        )}
      </main>

      <footer className="mx-auto max-w-5xl px-4 py-6 text-center text-xs text-slate-500">
        مواصلات © 2026 — مشروع مجتمعي
      </footer>
    </div>
  );
}


export default Route.component;
