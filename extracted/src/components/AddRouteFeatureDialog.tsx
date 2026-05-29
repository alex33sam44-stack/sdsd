import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Flag, Loader2, Send, X } from "lucide-react";
import type { Station, TaxiLine } from "@/data/stations";
import { addRouteFeatureContribution, type RouteFeatureKind } from "@/modules/shared/services/userContributions";
import { toast } from "@/components/ui/sonner";

const FEATURE_KINDS: RouteFeatureKind[] = ["pickup", "dropoff", "landmark", "crowding", "safety", "comfort", "accessibility", "other"];

export function AddRouteFeatureDialog({ station, line, onClose }: { station: Station; line: TaxiLine; onClose: () => void }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<RouteFeatureKind>("landmark");
  const [title, setTitle] = useState("");
  const [stopName, setStopName] = useState(line.stops[0]?.name ?? "");
  const [notes, setNotes] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      addRouteFeatureContribution({
        stationId: station.id,
        stationName: station.name,
        lineId: line.id,
        lineDestination: line.destination,
        kind,
        title: title.trim(),
        stopName: stopName.trim() || null,
        notes: notes.trim() || null,
        contact: contact.trim() || null,
      });
      toast.success(t("contrib.submitted"));
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(t("welcome.submitError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-secondary/60 backdrop-blur-sm p-4 animate-fade-in" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="w-full max-w-md bg-surface rounded-2xl border-2 border-secondary shadow-tactile p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-primary border-2 border-secondary grid place-items-center shrink-0">
              <Flag className="w-5 h-5 text-secondary" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <h2 className="font-black text-secondary text-lg">{t("contrib.addFeatureTitle")}</h2>
              <p className="text-xs font-bold text-muted-foreground truncate">{station.name} · {line.destination}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="close" className="h-9 w-9 grid place-items-center rounded-lg border-2 border-secondary bg-surface text-secondary">
            <X className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>

        <Field label={t("contrib.featureKind")}>
          <select value={kind} onChange={(e) => setKind(e.target.value as RouteFeatureKind)} className={inputCls}>
            {FEATURE_KINDS.map((k) => <option key={k} value={k}>{t(`contrib.featureKinds.${k}`)}</option>)}
          </select>
        </Field>

        <Field label={t("contrib.featureTitle")} required>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={120} className={inputCls} placeholder={t("contrib.featureTitlePlaceholder")} />
        </Field>

        <Field label={t("contrib.nearStop")}>
          <select value={stopName} onChange={(e) => setStopName(e.target.value)} className={inputCls}>
            <option value="">{t("contrib.noSpecificStop")}</option>
            {line.stops.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </Field>

        <Field label={t("welcome.fieldContact")}>
          <input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={120} className={inputCls} />
        </Field>

        <Field label={t("welcome.fieldNotes")}>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={500} className={`${inputCls} h-auto resize-none`} placeholder={t("contrib.featureNotesPlaceholder")} />
        </Field>

        <p className="rounded-lg border border-secondary/30 bg-surface-alt px-3 py-2 text-xs font-bold text-muted-foreground leading-relaxed">
          {t("contrib.reviewNote")}
        </p>

        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? <Loader2 className="w-5 h-5 animate-spin" strokeWidth={2.5} /> : <Send className="w-5 h-5" strokeWidth={2.5} />}
          {t("welcome.submit")}
        </button>
      </form>
    </div>
  );
}

const inputCls = "w-full h-11 px-3 rounded-lg border-2 border-secondary bg-surface font-bold text-secondary shadow-tactile-sm focus:outline-none focus:ring-2 focus:ring-primary";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-black text-secondary">
        {label}{required && <span className="text-destructive ms-1">*</span>}
      </span>
      {children}
    </label>
  );
}
