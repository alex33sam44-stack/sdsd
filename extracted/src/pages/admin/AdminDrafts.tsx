import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TopBar } from "@/components/TopBar";
import { listAllDrafts } from "@/modules/shared/services/lines";
import { Loader2 } from "lucide-react";
import { formatRelativeArabic } from "@/lib/storage";

const AdminDrafts = () => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { listAllDrafts(200).then((r) => { setRows(r); setLoading(false); }); }, []);

  return (
    <div className="min-h-screen bg-background">
      <TopBar title={t("admin.drafts")} backTo="/admin" />
      <div className="px-5 pt-5 pb-10 space-y-3">
        {loading && <div className="grid place-items-center py-10"><Loader2 className="w-6 h-6 animate-spin text-secondary" /></div>}
        {!loading && rows.length === 0 && (
          <div className="card-tactile bg-surface-alt"><p className="font-black text-secondary">{t("admin.noDrafts")}</p></div>
        )}
        {rows.map((d) => (
          <div key={d.id} className="rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="font-black text-secondary text-sm">{t(`admin.entity.${d.entity}` as any, { defaultValue: d.entity })}</span>
              <span className={`pill text-xs ${d.status === "pending" ? "bg-primary" : d.status === "applied" ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground border-destructive"}`}>
                {t(`admin.draftStatus.${d.status}` as any, { defaultValue: d.status })}
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-semibold mb-2">{formatRelativeArabic(d.created_at)}</p>
            {d.note && <p className="text-sm text-secondary mb-2 font-bold">{d.note}</p>}
            <pre dir="ltr" className="text-[11px] bg-surface-alt rounded-md p-2 overflow-x-auto font-mono">{JSON.stringify(d.patch, null, 2)}</pre>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminDrafts;
