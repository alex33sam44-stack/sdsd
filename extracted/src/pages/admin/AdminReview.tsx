import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TopBar } from "@/components/TopBar";
import { listPendingDrafts, applyDraft, rejectDraft } from "@/modules/shared/services/lines";
import { Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatRelativeArabic } from "@/lib/storage";

const AdminReview = () => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = () => { setLoading(true); listPendingDrafts().then((r) => { setRows(r); setLoading(false); }); };
  useEffect(reload, []);

  const onApply = async (id: string) => {
    setBusyId(id);
    try { await applyDraft(id); toast.success(t("admin.draftApplied")); reload(); }
    catch (e: any) { toast.error(e?.message ?? t("admin.applyFailed")); }
    setBusyId(null);
  };
  const onReject = async (id: string) => {
    setBusyId(id);
    try { await rejectDraft(id); toast.success(t("admin.draftRejected")); reload(); }
    catch (e: any) { toast.error(e?.message ?? t("admin.rejectFailed")); }
    setBusyId(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <TopBar title={t("admin.review")} backTo="/admin" />
      <div className="px-5 pt-5 pb-10 space-y-3">
        {loading && <div className="grid place-items-center py-10"><Loader2 className="w-6 h-6 animate-spin text-secondary" /></div>}
        {!loading && rows.length === 0 && (
          <div className="card-tactile bg-success/10 border-success">
            <p className="font-black text-secondary">{t("admin.noPending")}</p>
          </div>
        )}
        {rows.map((d) => (
          <div key={d.id} className="rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="font-black text-secondary text-sm">{t(`admin.entity.${d.entity}` as any, { defaultValue: d.entity })}</span>
              <span className="text-xs text-muted-foreground font-semibold">{formatRelativeArabic(d.created_at)}</span>
            </div>
            {d.note && <p className="text-sm text-secondary mb-2 font-bold">{d.note}</p>}
            <pre dir="ltr" className="text-[11px] bg-surface-alt rounded-md p-2 overflow-x-auto font-mono mb-3">{JSON.stringify(d.patch, null, 2)}</pre>
            <div className="grid grid-cols-2 gap-2">
              <button disabled={busyId === d.id} onClick={() => onReject(d.id)} className="h-11 rounded-lg border-2 border-destructive bg-destructive/10 text-destructive font-black flex items-center justify-center gap-1">
                <X className="w-4 h-4" strokeWidth={2.5} /> {t("common.reject")}
              </button>
              <button disabled={busyId === d.id} onClick={() => onApply(d.id)} className="h-11 rounded-lg border-2 border-secondary bg-success text-success-foreground font-black flex items-center justify-center gap-1">
                {busyId === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" strokeWidth={2.5} />} {t("common.apply")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminReview;
