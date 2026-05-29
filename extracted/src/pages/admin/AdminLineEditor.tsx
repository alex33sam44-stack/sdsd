import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TopBar } from "@/components/TopBar";
import { Save, RotateCcw, Route as RouteIcon, Power, PowerOff, FileEdit, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { snakify } from "@/modules/shared/services/_camelToSnake";
import { updateLine, setLinePublished, proposeDraft, deleteLine } from "@/modules/shared/services/lines";
import { formatRelativeTime } from "@/lib/storage";
import { coerceLineStatus, type LineStatusValue } from "@/modules/shared/services/enums";

// DB-stored vehicle type values (kept in Arabic for backward compatibility with existing rows).
type VehicleType = "ميكروباص" | "أتوبيس" | "ميني باص" | "تاكسي موقف";
const VEHICLE_TYPES: VehicleType[] = ["ميكروباص", "أتوبيس", "ميني باص", "تاكسي موقف"];
const VEHICLE_KEYS: Record<VehicleType, string> = {
  "ميكروباص": "admin.lineEditor.vehicle.microbus",
  "أتوبيس": "admin.lineEditor.vehicle.bus",
  "ميني باص": "admin.lineEditor.vehicle.minibus",
  "تاكسي موقف": "admin.lineEditor.vehicle.stationTaxi",
};

const AdminLineEditor = () => {
  const { t, i18n } = useTranslation();
  const { stationId = "", lineId = "" } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [base, setBase] = useState<any | null>(null);
  const [destination, setDestination] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>("ميكروباص");
  const [cars, setCars] = useState(0);
  const [status, setStatus] = useState<LineStatusValue>("active");
  const [pickupArea, setPickupArea] = useState("");
  const [color, setColor] = useState("#FFC800");
  const [zoneRef, setZoneRef] = useState("0,0,0,0");
  const [published, setPublished] = useState(false);

  useEffect(() => {
    let alive = true;
    api.get<unknown>(`/lines/${encodeURIComponent(lineId)}`)
      .then((raw) => {
        if (!alive) return;
        const data = raw ? snakify<any>(raw) : null;
        if (!data) { setMissing(true); setLoading(false); return; }
        setBase(data);
        setDestination(data.destination ?? "");
        setVehicleType((data.vehicle_type as VehicleType) ?? "ميكروباص");
        setCars(data.cars ?? 0);
        setStatus(coerceLineStatus(data.status) ?? "active");
        setPickupArea(data.pickup_area ?? "");
        setColor(data.color ?? "#FFC800");
        setZoneRef(`${data.zone_x ?? 0},${data.zone_y ?? 0},${data.zone_w ?? 0},${data.zone_h ?? 0}`);
        setPublished(!!data.is_published);
        setLoading(false);
      })
      .catch(() => { if (alive) { setMissing(true); setLoading(false); } });
    return () => { alive = false; };
  }, [lineId]);

  const buildPatch = () => {
    const parts = zoneRef.split(",").map((p) => Number(p.trim()));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
      toast.error(t("admin.lineEditor.zoneFormatError"));
      return null;
    }
    return {
      destination: destination.trim() || base.destination,
      vehicle_type: vehicleType,
      cars: Math.max(0, Math.min(99, Math.floor(cars))),
      status,
      pickup_area: pickupArea.trim(),
      color,
      zone_x: parts[0], zone_y: parts[1], zone_w: parts[2], zone_h: parts[3],
    };
  };

  const save = async () => {
    const patch = buildPatch(); if (!patch) return;
    try { await updateLine(lineId, patch as any); toast.success(t("admin.lineEditor.saved")); }
    catch (e: any) { toast.error(e?.message ?? t("admin.lineEditor.saveFailed")); }
  };

  const propose = async () => {
    const patch = buildPatch(); if (!patch) return;
    try { await proposeDraft({ entity: "line", entityId: lineId, patch: patch as any, note: t("admin.lineEditor.saveDraft") }); toast.success(t("admin.lineEditor.draftSent")); }
    catch (e: any) { toast.error(e?.message ?? t("admin.lineEditor.draftSendFailed")); }
  };

  const togglePublished = async () => {
    try { await setLinePublished(lineId, !published); setPublished(!published); toast.success(!published ? t("admin.lineEditor.published") : t("admin.lineEditor.unpublished")); }
    catch (e: any) { toast.error(e?.message ?? t("admin.lineEditor.updateFailed")); }
  };

  const remove = async () => {
    if (!confirm(t("admin.lineEditor.confirmDelete", { name: base?.destination ?? "" }))) return;
    try {
      await deleteLine(lineId);
      toast.success(t("admin.lineEditor.deleted"));
      navigate("/admin");
    } catch (e: any) { toast.error(e?.message ?? t("admin.lineEditor.deleteFailed")); }
  };

  const reset = () => {
    if (!base) return;
    setDestination(base.destination); setVehicleType((base.vehicle_type as VehicleType) ?? "ميكروباص");
    setCars(base.cars ?? 0); setStatus(coerceLineStatus(base.status) ?? "active"); setPickupArea(base.pickup_area ?? "");
    setColor(base.color ?? "#FFC800"); setZoneRef(`${base.zone_x ?? 0},${base.zone_y ?? 0},${base.zone_w ?? 0},${base.zone_h ?? 0}`);
    toast(t("admin.lineEditor.resetDone"));
  };

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="w-8 h-8 animate-spin text-secondary" /></div>;
  if (missing) return <Navigate to="/admin" replace />;

  const isRunning = status !== "stopped";
  const statusLabel =
    status === "active" ? t("admin.lineEditor.statusActive")
    : status === "crowded" ? t("admin.lineEditor.statusCrowded")
    : t("admin.lineEditor.statusStopped");

  return (
    <div className="min-h-screen bg-background">
      <TopBar title={t("admin.lineEditorTitle", { name: base.destination })} backTo="/admin" />
      <div className="px-5 pt-5 pb-10 space-y-4">
        <div className="rounded-xl border-2 border-secondary bg-surface-alt p-3 text-xs font-bold text-secondary flex items-center justify-between">
          <span>{t("admin.lineEditor.lastUpdate", { when: formatRelativeTime(base.updated_at, i18n.language) })}</span>
          <span className={`pill ${isRunning ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground border-destructive"}`}>
            {statusLabel}
          </span>
        </div>

        <Field label={t("admin.lineEditor.fieldDestination")}>
          <input value={destination} onChange={(e) => setDestination(e.target.value)} className="input-admin" />
        </Field>
        <Field label={t("admin.lineEditor.fieldVehicleType")}>
          <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value as VehicleType)} className="input-admin">
            {VEHICLE_TYPES.map((v) => <option key={v} value={v}>{t(VEHICLE_KEYS[v])}</option>)}
          </select>
        </Field>
        <Field label={t("admin.lineEditor.fieldCars")}>
          <input type="number" min={0} max={99} value={cars} onChange={(e) => setCars(Number(e.target.value))} className="input-admin tabular text-center text-lg font-black" />
        </Field>
        <Field label={t("admin.lineEditor.fieldPickup")}>
          <textarea value={pickupArea} onChange={(e) => setPickupArea(e.target.value)} rows={2} className="input-admin resize-none" />
        </Field>
        <Field label={t("admin.lineEditor.fieldColor")}>
          <div className="flex items-center gap-3">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-12 w-16 rounded-lg border-2 border-secondary bg-surface cursor-pointer" />
            <input value={color} onChange={(e) => setColor(e.target.value)} dir="ltr" className="input-admin flex-1" />
          </div>
        </Field>
        <Field label={t("admin.lineEditor.fieldZone")} hint={t("admin.lineEditor.fieldZoneHint")}>
          <input value={zoneRef} onChange={(e) => setZoneRef(e.target.value)} dir="ltr" className="input-admin tabular" />
        </Field>
        <Field label={t("admin.lineEditor.fieldStatus")} hint={status === "crowded" ? t("admin.lineEditor.crowdedHint") : undefined}>
          <button
            onClick={() => setStatus((s) => (s === "stopped" ? "active" : "stopped"))}
            className={`w-full h-12 rounded-lg border-2 border-secondary font-black flex items-center justify-center gap-2 ${isRunning ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"}`}
          >
            {isRunning ? <Power className="w-5 h-5" strokeWidth={2.5} /> : <PowerOff className="w-5 h-5" strokeWidth={2.5} />}
            {status === "active" ? t("admin.lineEditor.lineActiveVisible") : status === "crowded" ? t("admin.lineEditor.lineCrowdedVisible") : t("admin.lineEditor.lineStoppedHidden")}
          </button>
        </Field>
        <Field label={t("admin.lineEditor.fieldPublish")}>
          <button onClick={togglePublished} className={`w-full h-12 rounded-lg border-2 border-secondary font-black flex items-center justify-center gap-2 ${published ? "bg-primary text-secondary" : "bg-surface text-secondary"}`}>
            {published ? t("admin.lineEditor.publishedVisible") : t("admin.lineEditor.notPublishedDraft")}
          </button>
        </Field>

        <Link to={`/admin/route/${stationId}/${lineId}`} className="w-full h-12 rounded-lg border-2 border-secondary bg-primary text-secondary font-black flex items-center justify-center gap-2 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform">
          <RouteIcon className="w-5 h-5" strokeWidth={2.5} /> {t("admin.lineEditor.editStops")}
        </Link>

        <div className="grid grid-cols-3 gap-2 pt-2">
          <button onClick={reset} className="h-12 rounded-lg border-2 border-secondary bg-surface text-secondary font-black flex items-center justify-center gap-1 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform">
            <RotateCcw className="w-4 h-4" strokeWidth={2.5} /> {t("common.cancel")}
          </button>
          <button onClick={propose} className="h-12 rounded-lg border-2 border-secondary bg-primary/40 text-secondary font-black flex items-center justify-center gap-1 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform">
            <FileEdit className="w-4 h-4" strokeWidth={2.5} /> {t("common.draft")}
          </button>
          <button onClick={save} className="h-12 rounded-lg border-2 border-secondary bg-secondary text-secondary-foreground font-black flex items-center justify-center gap-1 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform">
            <Save className="w-4 h-4" strokeWidth={2.5} /> {t("common.save")}
          </button>
        </div>

        <button onClick={remove} className="w-full h-12 rounded-lg border-2 border-destructive bg-destructive text-destructive-foreground font-black flex items-center justify-center gap-2 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform">
          <Trash2 className="w-4 h-4" strokeWidth={2.5} /> {t("admin.lineEditor.deleteForever")}
        </button>
      </div>
    </div>
  );
};

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div className="rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm">
    <label className="block text-sm font-black text-secondary mb-2">{label}</label>
    {children}
    {hint && <p className="text-[11px] text-muted-foreground font-semibold mt-1.5">{hint}</p>}
  </div>
);

export default AdminLineEditor;
