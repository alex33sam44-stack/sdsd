import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TopBar } from "@/components/TopBar";
import { Plus, Save, Trash2, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { listStops, createStop, updateStop, deleteStop, reorderStops } from "@/modules/shared/services/stops";
import { api } from "@/lib/api";
import { snakify } from "@/modules/shared/services/_camelToSnake";

type StopRow = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  keywords: string[];
  __new?: boolean;
};

const AdminRouteEditor = () => {
  const { t } = useTranslation();
  const { stationId = "", lineId = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [destination, setDestination] = useState("");
  const [stops, setStops] = useState<StopRow[]>([]);
  const [originalIds, setOriginalIds] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      let line: any = null;
      try {
        line = snakify<any>(await api.get<unknown>(`/lines/${encodeURIComponent(lineId)}`));
      } catch {
        line = null;
      }
      if (!alive) return;
      if (!line) { setMissing(true); setLoading(false); return; }
      setDestination(line.destination ?? "");
      const rows = await listStops(lineId);
      if (!alive) return;
      setStops(rows.map((r) => ({ id: r.id, name: r.name, lat: Number(r.lat), lng: Number(r.lng), keywords: r.keywords ?? [] })));
      setOriginalIds(rows.map((r) => r.id));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [lineId]);

  const update = (i: number, patch: Partial<StopRow>) =>
    setStops((p) => p.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const add = () => {
    const tempId = `new-${crypto.randomUUID?.() ?? Date.now()}`;
    setStops((p) => [...p, { id: tempId, name: t("admin.routeEditor.newStop"), lat: 0, lng: 0, keywords: [], __new: true }]);
  };

  const remove = (i: number) => setStops((p) => p.filter((_, idx) => idx !== i));

  const move = (i: number, dir: -1 | 1) => {
    setStops((p) => {
      const next = [...p]; const j = i + dir;
      if (j < 0 || j >= next.length) return p;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const save = async () => {
    for (const s of stops) {
      if (!s.name.trim()) return toast.error(t("admin.routeEditor.needName"));
      if (Number.isNaN(s.lat) || Number.isNaN(s.lng)) return toast.error(t("admin.routeEditor.invalidCoords"));
    }
    try {
      const liveIds = new Set(stops.filter((s) => !s.__new).map((s) => s.id));
      for (const oldId of originalIds) if (!liveIds.has(oldId)) await deleteStop(oldId);

      const finalOrder: string[] = [];
      for (const s of stops) {
        if (s.__new) {
          const created = await createStop(lineId, { name: s.name.trim(), lat: s.lat, lng: s.lng, keywords: s.keywords });
          finalOrder.push(created.id);
        } else {
          await updateStop(s.id, { name: s.name.trim(), lat: s.lat, lng: s.lng, keywords: s.keywords });
          finalOrder.push(s.id);
        }
      }
      await reorderStops(lineId, finalOrder);
      toast.success(t("admin.routeEditor.saved"));

      const rows = await listStops(lineId);
      setStops(rows.map((r) => ({ id: r.id, name: r.name, lat: Number(r.lat), lng: Number(r.lng), keywords: r.keywords ?? [] })));
      setOriginalIds(rows.map((r) => r.id));
    } catch (e: any) {
      toast.error(e?.message ?? t("admin.routeEditor.saveFailed"));
    }
  };

  const reload = async () => {
    const rows = await listStops(lineId);
    setStops(rows.map((r) => ({ id: r.id, name: r.name, lat: Number(r.lat), lng: Number(r.lng), keywords: r.keywords ?? [] })));
    setOriginalIds(rows.map((r) => r.id));
    toast(t("admin.routeEditor.reloaded"));
  };

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="w-8 h-8 animate-spin text-secondary" /></div>;
  if (missing) return <Navigate to="/admin" replace />;

  return (
    <div className="min-h-screen bg-background">
      <TopBar title={t("admin.routeEditorTitle", { name: destination })} backTo={`/admin/line/${stationId}/${lineId}`} />
      <div className="px-5 pt-5 pb-10 space-y-4">
        <div className="card-tactile bg-secondary text-secondary-foreground">
          <p className="font-black text-primary text-sm">{t("admin.routeEditor.title")}</p>
          <p className="text-sm font-semibold mt-1 text-secondary-foreground/90">
            {t("admin.routeEditor.intro")}
          </p>
        </div>

        <ul className="space-y-3">
          {stops.map((s, i) => (
            <li key={s.id} className="rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="h-7 w-7 grid place-items-center rounded-md border-2 border-secondary bg-primary text-secondary font-black text-xs tabular">{i + 1}</span>
                  <div className="flex flex-col">
                    <button onClick={() => move(i, -1)} className="text-xs font-black text-secondary leading-none p-0.5" aria-label={t("admin.routeEditor.moveUp")}>▲</button>
                    <button onClick={() => move(i, 1)} className="text-xs font-black text-secondary leading-none p-0.5" aria-label={t("admin.routeEditor.moveDown")}>▼</button>
                  </div>
                </div>
                <button onClick={() => remove(i)} className="h-9 w-9 grid place-items-center rounded-lg border-2 border-destructive bg-destructive/10 text-destructive" aria-label={t("admin.routeEditor.deleteStop")}>
                  <Trash2 className="w-4 h-4" strokeWidth={2.5} />
                </button>
              </div>

              <label className="block text-xs font-black text-secondary mb-1">{t("admin.routeEditor.stopName")}</label>
              <input value={s.name} onChange={(e) => update(i, { name: e.target.value })} className="input-admin mb-2" />

              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="block text-xs font-black text-secondary mb-1">{t("admin.routeEditor.lat")}</label>
                  <input type="number" step="0.0001" value={s.lat} onChange={(e) => update(i, { lat: Number(e.target.value) })} dir="ltr" className="input-admin tabular" />
                </div>
                <div>
                  <label className="block text-xs font-black text-secondary mb-1">{t("admin.routeEditor.lng")}</label>
                  <input type="number" step="0.0001" value={s.lng} onChange={(e) => update(i, { lng: Number(e.target.value) })} dir="ltr" className="input-admin tabular" />
                </div>
              </div>

              <label className="block text-xs font-black text-secondary mb-1">{t("admin.routeEditor.keywords")}</label>
              <input
                value={(s.keywords ?? []).join(", ")}
                onChange={(e) => update(i, { keywords: e.target.value.split(/[،,]/).map((k) => k.trim()).filter(Boolean) })}
                className="input-admin"
                placeholder={t("admin.routeEditor.keywordsPlaceholder")}
              />
            </li>
          ))}
        </ul>

        <button onClick={add} className="w-full h-12 rounded-lg border-2 border-dashed border-secondary bg-surface-alt text-secondary font-black flex items-center justify-center gap-2">
          <Plus className="w-5 h-5" strokeWidth={2.5} /> {t("admin.routeEditor.addStop")}
        </button>

        <div className="flex items-center gap-2 pt-2">
          <button onClick={reload} className="flex-1 h-12 rounded-lg border-2 border-secondary bg-surface text-secondary font-black flex items-center justify-center gap-2 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform">
            <RotateCcw className="w-4 h-4" strokeWidth={2.5} /> {t("common.cancel")}
          </button>
          <button onClick={save} className="flex-1 h-12 rounded-lg border-2 border-secondary bg-secondary text-secondary-foreground font-black flex items-center justify-center gap-2 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform">
            <Save className="w-4 h-4" strokeWidth={2.5} /> {t("admin.routeEditor.saveRoute")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminRouteEditor;
