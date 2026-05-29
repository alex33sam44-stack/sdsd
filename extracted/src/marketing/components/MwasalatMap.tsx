import type { Station } from "@/marketing/lib/stations";
import { MapPin, Navigation } from "lucide-react";

type Props = {
  user: { lat: number; lng: number } | null;
  stations: (Station & { distanceKm: number })[];
  onNavigate: (s: Station) => void;
};

/**
 * طبقة خفيفة بدون Google Maps وبدون تحميل tiles عامة.
 * خريطة التتبع اللايف تستخدم MapLibre + PMTiles في InteractiveTripMap؛ هنا نعرض
 * أقرب المحطات فوق canvas بصري بسيط حتى لا نحمّل أي مزود خرائط خارجي في صفحة الترحيب.
 */
export function MwasalatMap({ user, stations, onNavigate }: Props) {
  const nearest = stations[0];
  const visibleStations = stations.slice(0, 6);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-slate-950 text-white">
      <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:36px_36px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(34,197,94,.25),transparent_36%),radial-gradient(circle_at_35%_70%,rgba(14,165,233,.25),transparent_30%)]" />

      <div className="relative z-10 flex h-full flex-col justify-between p-4" dir="rtl">
        <div className="rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur">
          <p className="text-xs font-black text-emerald-200">خريطة مواصلات بدون Google</p>
          <p className="mt-1 text-[11px] leading-5 text-white/70">
            أقرب المحطات تظهر محليًا، وطبقة التتبع اللايف تعمل بـ MapLibre + PMTiles عند تفعيل CDN.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {visibleStations.map((station, index) => (
            <button
              key={station.id}
              onClick={() => onNavigate(station)}
              className="rounded-2xl border border-white/10 bg-white/10 p-3 text-right backdrop-blur transition hover:bg-white/15"
            >
              <div className="flex items-center gap-2 text-xs font-black">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-400 text-slate-950">{index + 1}</span>
                {station.name}
              </div>
              <p className="mt-1 text-[11px] text-white/65">{station.distanceKm.toFixed(1)} كم · {station.type}</p>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 rounded-2xl bg-white p-3 text-slate-900 shadow-xl">
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700"><MapPin className="h-4 w-4" /></div>
            <div>
              <p className="text-xs font-black">{user ? "موقعك متحدد" : "استخدم موقعك"}</p>
              <p className="text-[11px] text-slate-500">{nearest ? `أقرب محطة: ${nearest.name}` : "هنعرض أقرب المواقف حولك"}</p>
            </div>
          </div>
          {nearest && (
            <button
              onClick={() => onNavigate(nearest)}
              className="inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-black text-white"
            >
              <Navigation className="h-3.5 w-3.5" /> افتح
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
