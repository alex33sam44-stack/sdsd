import { createFileRoute, Link } from "@/marketing/routerCompat";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Trophy, Loader2, Crown, Medal, MapPin, Globe2, Navigation, Share2 } from "lucide-react";
import {
  badgeForPoints, fetchLeaderboard, fetchLocalLeaderboard,
  type LeaderboardEntry, type LocalLeaderboardEntry,
} from "@/marketing/lib/chat";

export const Route = createFileRoute("/leaderboard")({
  component: LeaderboardPage,
  head: () => ({
    meta: [
      { title: "المتصدرون — مواصلات" },
      { name: "description", content: "أبطال المناطق: أكثر ناس ساعدت غيرها بالبلاغات، الإجابات، الرحلات، والدعوات." },
    ],
  }),
});

type Mode = "local" | "national";
type Geo = { lat: number; lng: number } | null;

const RADII = [3, 10, 25] as const;

function LeaderboardPage() {
  const [mode, setMode] = useState<Mode>("local");
  const [radiusKm, setRadiusKm] = useState<number>(10);
  const [geo, setGeo] = useState<Geo>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [national, setNational] = useState<LeaderboardEntry[]>([]);
  const [local, setLocal] = useState<LocalLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // get GPS once on mount
  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setGeoErr("المتصفح ميدعمش تحديد الموقع");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => setGeoErr(err.message || "تعذر تحديد موقعك"),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60_000 },
    );
  }, []);

  // load data based on mode
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const run = async () => {
      try {
        if (mode === "national") {
          const r = await fetchLeaderboard(100);
          if (!cancelled) setNational(r);
        } else {
          if (!geo) { if (!cancelled) setLocal([]); return; }
          const r = await fetchLocalLeaderboard(geo.lat, geo.lng, radiusKm, 100);
          if (!cancelled) setLocal(r);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [mode, radiusKm, geo]);

  const rows = useMemo(() => mode === "local" ? local : national, [mode, local, national]);

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowRight className="h-4 w-4" />
            رجوع للخريطة
          </Link>
          <h1 className="inline-flex items-center gap-2 text-lg font-bold">
            <Trophy className="h-5 w-5 text-amber-500" />
            أبطال المناطق
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-4 rounded-3xl border bg-card p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
              <Crown className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-foreground">اللي يساعد الناس يظهر للناس.</h2>
              <p className="mt-1 text-sm leading-7 text-muted-foreground">
                مش ليدربورد أرقام وخلاص؛ ده مكان يبان فيه خبير كل منطقة، منقذ الخط، والناس اللي بلاغاتهم وإجاباتهم وفّرت وقت وبهدلة لغيرهم.
              </p>
            </div>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="mb-4 inline-flex rounded-full border bg-card p-1">
          <button
            onClick={() => setMode("local")}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition ${
              mode === "local" ? "bg-amber-500 text-white shadow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <MapPin className="h-4 w-4" /> منطقتي
          </button>
          <button
            onClick={() => setMode("national")}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition ${
              mode === "national" ? "bg-amber-500 text-white shadow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Globe2 className="h-4 w-4" /> مصر كلها
          </button>
        </div>

        {mode === "local" && (
          <div className="mb-4 rounded-2xl border bg-gradient-to-br from-amber-50 to-orange-50 p-4">
            <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
              <Navigation className="h-4 w-4" /> اتنافس مع جيرانك
            </p>
            <p className="mt-1 text-xs text-amber-800/80">
              مين ساعد منطقته أكتر؟ الترتيب مبني على النقاط والنشاط القريب: بلاغات، محطات، رحلات، إجابات، ودعوات ناجحة.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {RADII.map((r) => (
                <button
                  key={r}
                  onClick={() => setRadiusKm(r)}
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition ${
                    radiusKm === r
                      ? "bg-amber-600 border-amber-600 text-white"
                      : "bg-white border-amber-200 text-amber-800 hover:bg-amber-100"
                  }`}
                >
                  {r} كم
                </button>
              ))}
            </div>
            {geoErr && !geo && (
              <p className="mt-3 text-xs text-rose-600">⚠️ {geoErr} — فعّل الـ GPS</p>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : mode === "local" && !geo ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            محتاجين موقعك علشان نعرض جيرانك
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-muted-foreground">
            {mode === "local" ? "مفيش حد نشيط في الدايرة دي لسه — كن الأول! 🚀" : "مفيش بيانات لسه."}
          </div>
        ) : (
          <ol className="space-y-2">
            {rows.map((r, i) => {
              const badge = badgeForPoints(r.points);
              const rank = i + 1;
              const localRow = mode === "local" ? (r as LocalLeaderboardEntry) : null;
              return (
                <li
                  key={r.user_id}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">
                    {rank === 1 ? (
                      <Crown className="h-4 w-4 text-amber-500" />
                    ) : rank === 2 ? (
                      <Medal className="h-4 w-4 text-zinc-400" />
                    ) : rank === 3 ? (
                      <Medal className="h-4 w-4 text-amber-700" />
                    ) : (
                      rank
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    {r.public_slug ? (
                      <Link to={`/u/${r.public_slug}`} className="truncate font-medium text-foreground hover:text-amber-700 hover:underline">
                        {r.display_name ?? "مستخدم"}
                      </Link>
                    ) : (
                      <p className="truncate font-medium text-foreground">{r.display_name ?? "مستخدم"}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                      {localRow && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          <MapPin className="h-2.5 w-2.5" />
                          {localRow.nearest_km < 1
                            ? `${Math.round(localRow.nearest_km * 1000)} م`
                            : `${localRow.nearest_km.toFixed(1)} كم`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-left">
                    <span className="block text-sm font-bold text-amber-600 dark:text-amber-400">{r.points} نقطة</span>
                    {r.public_slug && (
                      <Link to={`/u/${r.public_slug}`} className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-amber-700">
                        <Share2 className="h-3 w-3" /> كارت الإنجاز
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </main>
    </div>
  );
}


export default Route.component;
