import { createFileRoute, Link } from "@/marketing/routerCompat";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchPublicHeatmap, type HeatmapPoint } from "@/marketing/lib/heatmap";

export const Route = createFileRoute("/heatmap")({
  component: HeatmapPage,
  head: () => ({
    meta: [
      { title: "نبض القاهرة لايف 🔥 — خريطة بلاغات المواصلات" },
      { name: "description", content: "شوف القاهرة بتنبض دلوقتي — كل البلاغات النشطة على خريطة لايف" },
      { property: "og:title", content: "نبض القاهرة لايف 🔥" },
      { property: "og:description", content: "خريطة بلاغات المواصلات الحية" },
    ],
  }),
});

// Cairo bounding box for visualization
const CAIRO = { minLat: 29.85, maxLat: 30.25, minLng: 31.05, maxLng: 31.55 };

const TYPE_COLOR: Record<string, string> = {
  زحمة: "bg-amber-500",
  حادثة: "bg-rose-500",
  "كمين": "bg-violet-500",
  "تعطل": "bg-orange-500",
  "اخر معاد": "bg-sky-500",
};

function HeatmapPage() {
  const [points, setPoints] = useState<HeatmapPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setPoints(await fetchPublicHeatmap());
      setUpdatedAt(new Date());
    } finally { setLoading(false); }
  };
  useEffect(() => {
    void load();
    const id = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(id);
  }, []);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of points) m.set(p.type, (m.get(p.type) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [points]);

  const project = (lat: number, lng: number) => {
    const x = ((lng - CAIRO.minLng) / (CAIRO.maxLng - CAIRO.minLng)) * 100;
    const y = ((CAIRO.maxLat - lat) / (CAIRO.maxLat - CAIRO.minLat)) * 100;
    return { x: Math.max(2, Math.min(98, x)), y: Math.max(2, Math.min(98, y)) };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white" dir="rtl">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-sm text-slate-300">
            <ArrowRight className="h-4 w-4" /> الرئيسية
          </Link>
          <h1 className="text-base font-bold">🔥 نبض القاهرة لايف</h1>
          <button onClick={load} className="text-slate-300 hover:text-white"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 space-y-4">
        <div className="text-center">
          <h2 className="text-3xl font-black sm:text-4xl">شوف القاهرة بتنبض دلوقتي</h2>
          <p className="mt-2 text-sm text-slate-300">
            {loading ? "بنحدّث…" : `${points.length} بلاغ نشط آخر ساعتين`} {updatedAt && `· آخر تحديث ${updatedAt.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}`}
          </p>
        </div>

        {/* Heatmap */}
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-700/40 to-slate-900/40 shadow-2xl">
          {/* faint grid */}
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
          {/* Nile */}
          <div className="absolute inset-y-0 left-[42%] w-[3%] bg-gradient-to-b from-sky-700/40 via-sky-600/30 to-sky-800/40 blur-sm" />
          <div className="absolute top-4 right-4 rounded-md bg-white/10 px-2 py-1 text-[10px] backdrop-blur">القاهرة الكبرى</div>

          {loading && points.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-sky-400" />
            </div>
          ) : points.length === 0 ? (
            <div className="flex h-full items-center justify-center text-slate-400">
              <p>مفيش بلاغات نشطة دلوقتي 🌿</p>
            </div>
          ) : (
            points.map((p, i) => {
              const { x, y } = project(p.lat, p.lng);
              const color = TYPE_COLOR[p.type] ?? "bg-emerald-500";
              const size = Math.min(40, 14 + p.weight * 3);
              return (
                <div
                  key={i}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${x}%`, top: `${y}%` }}
                  title={`${p.type} · ×${p.weight}`}
                >
                  <span className={`absolute inline-flex animate-ping rounded-full ${color} opacity-60`} style={{ width: size, height: size }} />
                  <span className={`relative inline-flex rounded-full ${color} shadow-lg`} style={{ width: size / 2, height: size / 2 }} />
                </div>
              );
            })
          )}
        </div>

        {/* Legend */}
        {counts.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 text-xs">
            {counts.map(([type, n]) => (
              <span key={type} className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 backdrop-blur">
                <span className={`h-2 w-2 rounded-full ${TYPE_COLOR[type] ?? "bg-emerald-500"}`} />
                {type} <b>{n}</b>
              </span>
            ))}
          </div>
        )}

        {/* CTA */}
        <div className="rounded-3xl border border-sky-400/20 bg-gradient-to-br from-sky-500/10 to-violet-500/10 p-6 text-center backdrop-blur">
          <Sparkles className="mx-auto h-6 w-6 text-amber-400" />
          <h3 className="mt-2 text-xl font-bold">عاوز تشارك؟</h3>
          <p className="mt-1 text-sm text-slate-300">سجل في ثانية وابدأ تبلغ عن الزحمة، الحوادث، والكمائن — ساعد الناس وكسب نقاط.</p>
          <div className="mt-4 flex justify-center gap-2">
            <Link to="/login"><Button className="bg-sky-500 hover:bg-sky-600">سجّل دلوقتي</Button></Link>
            <Link to="/"><Button variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10">افتح التطبيق</Button></Link>
          </div>
        </div>
      </main>
    </div>
  );
}


export default Route.component;
