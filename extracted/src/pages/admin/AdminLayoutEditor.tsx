import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TopBar } from "@/components/TopBar";
import { StationMap } from "@/components/StationMap";
import { StationIntelPanel } from "@/components/StationIntelPanel";
import { Save, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { snakify } from "@/modules/shared/services/_camelToSnake";
import { updateLine } from "@/modules/shared/services/lines";
import type { TaxiLine } from "@/data/stations";
import type { IntelLine, IntelZone } from "@/modules/shared/services/stationIntel";

type ZoneDraft = { x: number; y: number; w: number; h: number; label: string; color: string };

const AdminLayoutEditor = () => {
  const { t } = useTranslation();
  const { stationId = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [station, setStation] = useState<any | null>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ZoneDraft>>({});
  const [zones, setZones] = useState<IntelZone[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      let s: any = null, ls: any[] = [], zs: any[] = [];
      try {
        const [stationRaw, linesRaw, zonesRaw] = await Promise.all([
          api.get<unknown>(`/stations/${encodeURIComponent(stationId)}`).catch(() => null),
          api.get<unknown[]>(`/lines?stationId=${encodeURIComponent(stationId)}`).catch(() => []),
          api.get<unknown[]>(`/zones?stationId=${encodeURIComponent(stationId)}`).catch(() => []),
        ]);
        s = stationRaw ? snakify<any>(stationRaw) : null;
        ls = snakify<any[]>(linesRaw ?? []);
        zs = snakify<any[]>(zonesRaw ?? []);
      } catch {
        s = null;
      }
      if (!alive) return;
      if (!s) { setMissing(true); setLoading(false); return; }
      setStation(s);
      ls.sort((a, b) => (a.destination ?? "").localeCompare(b.destination ?? ""));
      setLines(ls);
      setZones(zs as IntelZone[]);
      const init: Record<string, ZoneDraft> = {};
      ls.forEach((l: any) => {
        init[l.id] = { x: Number(l.zone_x ?? 10), y: Number(l.zone_y ?? 10), w: Number(l.zone_w ?? 30), h: Number(l.zone_h ?? 15), label: l.destination, color: l.color };
      });
      setDrafts(init);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [stationId]);

  const update = (id: string, patch: Partial<ZoneDraft>) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const previewLines: TaxiLine[] = lines.map((l: any) => ({
    id: l.id,
    destination: drafts[l.id]?.label ?? l.destination,
    color: drafts[l.id]?.color ?? l.color,
    cars: l.cars ?? 0,
    updatedAt: l.updated_at ?? new Date().toISOString(),
    pickupArea: l.pickup_area ?? "",
    vehicleType: l.vehicle_type,
    zone: { x: drafts[l.id]?.x ?? 0, y: drafts[l.id]?.y ?? 0, w: drafts[l.id]?.w ?? 0, h: drafts[l.id]?.h ?? 0 },
    stops: [],
  }));

  const intelLines: IntelLine[] = useMemo(
    () => lines.map((l: any) => ({
      id: l.id,
      destination: l.destination,
      pickup_area: l.pickup_area ?? null,
      status: l.status ?? "active",
      cars: l.cars ?? 0,
      cars_updated_at: l.cars_updated_at ?? l.updated_at ?? null,
      zone_x: l.zone_x, zone_y: l.zone_y, zone_w: l.zone_w, zone_h: l.zone_h,
      is_published: l.is_published ?? true,
    })),
    [lines],
  );

  const saveAll = async () => {
    try {
      for (const [id, d] of Object.entries(drafts)) {
        await updateLine(id, {
          destination: d.label, color: d.color,
          zone_x: d.x, zone_y: d.y, zone_w: d.w, zone_h: d.h,
        } as any);
      }
      toast.success(t("admin.layout.saved"));
    } catch (e: any) {
      toast.error(e?.message ?? t("admin.layout.saveFailed"));
    }
  };

  const reset = () => {
    const init: Record<string, ZoneDraft> = {};
    lines.forEach((l: any) => {
      init[l.id] = { x: Number(l.zone_x ?? 10), y: Number(l.zone_y ?? 10), w: Number(l.zone_w ?? 30), h: Number(l.zone_h ?? 15), label: l.destination, color: l.color };
    });
    setDrafts(init);
    toast(t("admin.layout.resetDone"));
  };

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="w-8 h-8 animate-spin text-secondary" /></div>;
  if (missing) return <Navigate to="/admin" replace />;

  return (
    <div className="min-h-screen bg-background">
      <TopBar title={t("admin.layoutTitle", { name: station.name })} backTo="/admin" />
      <div className="px-5 pt-5 pb-10 space-y-5">
        <div className="card-tactile bg-secondary text-secondary-foreground">
          <p className="font-black text-primary text-sm">{t("admin.layout.title")}</p>
          <p className="text-sm font-semibold mt-1 text-secondary-foreground/90">
            {t("admin.layout.intro")}
          </p>
        </div>

        <StationIntelPanel lines={intelLines} zones={zones} />

        <StationMap lines={previewLines} onSelectLine={() => {}} />

        <ul className="space-y-3">
          {lines.map((l: any) => {
            const d = drafts[l.id]; if (!d) return null;
            return (
              <li key={l.id} className="rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-3 h-10 rounded-md border-2 border-secondary" style={{ backgroundColor: d.color }} />
                  <p className="font-black text-secondary truncate flex-1">{l.destination}</p>
                </div>

                <label className="block text-xs font-black text-secondary mb-1">{t("admin.layout.mapLabel")}</label>
                <input value={d.label} onChange={(e) => update(l.id, { label: e.target.value })} className="input-admin mb-2" />

                <label className="block text-xs font-black text-secondary mb-1">{t("admin.layout.color")}</label>
                <div className="flex items-center gap-2 mb-2">
                  <input type="color" value={d.color} onChange={(e) => update(l.id, { color: e.target.value })} className="h-10 w-14 rounded-lg border-2 border-secondary cursor-pointer" />
                  <input value={d.color} onChange={(e) => update(l.id, { color: e.target.value })} dir="ltr" className="input-admin flex-1" />
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {(["x", "y", "w", "h"] as const).map((k) => (
                    <div key={k}>
                      <label className="block text-[11px] font-black text-secondary mb-1 uppercase">{k}</label>
                      <input type="number" min={0} max={100} value={d[k]} onChange={(e) => update(l.id, { [k]: Number(e.target.value) } as Partial<ZoneDraft>)} dir="ltr" className="input-admin tabular text-center" />
                    </div>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-2 pt-2">
          <button onClick={reset} className="flex-1 h-12 rounded-lg border-2 border-secondary bg-surface text-secondary font-black flex items-center justify-center gap-2 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform">
            <RotateCcw className="w-4 h-4" strokeWidth={2.5} /> {t("common.cancel")}
          </button>
          <button onClick={saveAll} className="flex-1 h-12 rounded-lg border-2 border-secondary bg-secondary text-secondary-foreground font-black flex items-center justify-center gap-2 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform">
            <Save className="w-4 h-4" strokeWidth={2.5} /> {t("admin.layout.saveLayout")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminLayoutEditor;
