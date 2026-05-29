import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TopBar } from "@/components/TopBar";
import { listAudit } from "@/modules/shared/services/audit";
import { Loader2 } from "lucide-react";
import { formatRelativeArabic } from "@/lib/storage";

const ENTITIES = ["line", "station", "route_stop", "layout_zone", "station_layout", "draft_changes", "snapshot", "migration"] as const;

const AdminAudit = () => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { listAudit(filter || undefined, 200).then((r) => { setRows(r); setLoading(false); }); }, [filter]);

  return (
    <div className="min-h-screen bg-background">
      <TopBar title={t("admin.audit")} backTo="/admin" />
      <div className="px-5 pt-5 pb-10 space-y-3">
        <div className="rounded-2xl border-2 border-secondary bg-surface p-3 shadow-tactile-sm">
          <label className="block text-xs font-black text-secondary mb-1">{t("admin.filterByEntity")}</label>
          <select value={filter} onChange={(e) => { setFilter(e.target.value); setLoading(true); }} className="input-admin">
            <option value="">{t("admin.all")}</option>
            {ENTITIES.map((k) => <option key={k} value={k}>{t(`admin.entity.${k}` as any)}</option>)}
          </select>
        </div>

        {loading && <div className="grid place-items-center py-10"><Loader2 className="w-6 h-6 animate-spin text-secondary" /></div>}
        {!loading && rows.length === 0 && (
          <div className="card-tactile bg-surface-alt"><p className="font-black text-secondary">{t("admin.noLogs")}</p></div>
        )}
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border-2 border-secondary bg-surface p-3 shadow-tactile-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="font-black text-secondary text-sm">
                  {t(`admin.entity.${r.entity}` as any, { defaultValue: r.entity })} · {r.action}
                </span>
                <span className="text-xs text-muted-foreground font-semibold">{formatRelativeArabic(r.created_at)}</span>
              </div>
              {r.diff && (
                <pre dir="ltr" className="text-[11px] bg-surface-alt rounded-md p-2 overflow-x-auto font-mono">{JSON.stringify(r.diff, null, 2)}</pre>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default AdminAudit;
