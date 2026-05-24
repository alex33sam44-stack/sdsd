import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TopBar } from "@/components/TopBar";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { PushNotificationsCard } from "@/components/PushNotificationsCard";
import { clearDefaultStationId, getDefaultStationId, setDefaultStationId } from "@/lib/storage";
import { Building2, Check, Loader2, Trash2, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { TenantSwitcher } from "@/modules/tenancy/TenantSwitcher";
import { useTenant } from "@/modules/tenancy/TenantContext";
import { useStations } from "@/modules/shared/hooks/useStationsData";

const SettingsPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [current, setCurrent] = useState<string | null>(getDefaultStationId());
  const { memberships, currentTenant } = useTenant();
  const { data: stations = [], isLoading } = useStations();

  const sortedStations = useMemo(() => [...stations].sort((a, b) => a.name.localeCompare(b.name)), [stations]);

  const choose = (id: string) => {
    setDefaultStationId(id);
    setCurrent(id);
  };

  const reset = () => {
    clearDefaultStationId();
    setCurrent(null);
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <TopBar title={t("settings.title")} backTo={current ? `/station/${current}` : "/"} />
      <div className="px-5 pt-5 pb-8 space-y-5">
        <LanguageSwitcher variant="full" />

        <PushNotificationsCard />

        <div className="rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm space-y-2">
          <h2 className="font-black text-secondary text-lg">الجهة الحالية</h2>
          <p className="text-sm text-muted-foreground font-semibold">
            إذا كنت منتميًا لأكثر من جهة تشغيل، يمكنك التبديل بينها من هنا.
          </p>
          {memberships.length === 0 ? (
            <div className="rounded-lg border-2 border-secondary/20 bg-surface-alt p-3 space-y-3">
              <p className="text-sm font-semibold text-muted-foreground">
                لا توجد أي جهة مرتبطة بحسابك بعد. أنشئ جهتك الأولى أو انضم عبر رابط دعوة.
              </p>
              <Link to="/tenant/setup" className="btn-primary w-full">
                <Building2 className="w-4 h-4" />
                إعداد الجهة الأولى
              </Link>
            </div>
          ) : (
            <>
              <TenantSwitcher />
              <div className="rounded-lg border-2 border-secondary/20 bg-surface-alt p-3 text-sm font-semibold text-secondary">
                الجهة النشطة الآن: <span className="font-black text-secondary">{currentTenant?.name ?? "—"}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Link to="/tenant/setup" className="btn-secondary w-full">
                  <Building2 className="w-4 h-4" />
                  إنشاء/الانضمام إلى جهة
                </Link>
                <Link to="/admin/team" className="btn-secondary w-full">
                  <Users className="w-4 h-4" />
                  إدارة فريق الجهة
                </Link>
              </div>
            </>
          )}
        </div>

        <div>
          <h2 className="font-black text-secondary text-lg mb-1">{t("settings.defaultStation")}</h2>
          <p className="text-sm text-muted-foreground font-semibold">
            {t("settings.defaultStationDesc")}
          </p>
        </div>

        {isLoading ? (
          <div className="grid place-items-center py-10"><Loader2 className="w-6 h-6 animate-spin text-secondary" /></div>
        ) : (
          <ul className="space-y-3">
            {sortedStations.map((s) => {
              const active = current === s.id;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => choose(s.id)}
                    className={`w-full text-start rounded-xl border-2 border-secondary p-4 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform flex items-center justify-between gap-3 ${
                      active ? "bg-primary" : "bg-surface"
                    }`}
                  >
                    <div>
                      <p className="font-black text-secondary">{s.name}</p>
                      <p className="text-xs text-muted-foreground font-semibold">{s.area}</p>
                    </div>
                    {active && (
                      <span className="h-9 w-9 grid place-items-center rounded-lg bg-secondary text-primary">
                        <Check className="w-5 h-5" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
            {!sortedStations.length && (
              <li className="rounded-xl border-2 border-secondary bg-surface-alt p-4 text-sm font-semibold text-muted-foreground">
                لا توجد مواقف مرتبطة بالجهة الحالية بعد.
              </li>
            )}
          </ul>
        )}

        <button onClick={reset} className="btn-secondary w-full">
          <Trash2 className="w-5 h-5" strokeWidth={2.5} />
          {t("settings.clearDefault")}
        </button>

        <Link to="/admin" className="block text-center text-sm font-bold text-muted-foreground underline pt-2">
          {t("welcome.adminFooter")}
        </Link>
      </div>
    </div>
  );
};

export default SettingsPage;
