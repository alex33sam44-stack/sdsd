import { useTranslation } from "react-i18next";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { WifiOff, SignalLow, CloudOff } from "lucide-react";

/**
 * Slim, RTL-aware banner that surfaces weak/offline conditions.
 * - "offline" : red. Network is gone.
 * - "weak"    : amber. Connection is alive but slow / saveData on.
 * - otherwise : renders nothing.
 *
 * The banner sits above page content but does not push layout when hidden.
 * It is intentionally small (single row) so it never disturbs existing UX.
 */
export function NetworkStatusBanner() {
  const { t } = useTranslation();
  const q = useNetworkStatus();
  if (q === "online") return null;

  const isOffline = q === "offline";
  const Icon = isOffline ? WifiOff : SignalLow;
  const label = isOffline
    ? t("network.offline", "لا يوجد اتصال")
    : t("network.weak", "اتصال ضعيف");
  const hint = isOffline
    ? t("network.offlineHint", "تعرض البيانات المحفوظة محلياً")
    : t("network.weakHint", "قد يستغرق التحديث وقتاً أطول");

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        "w-full px-3 py-2 flex items-center gap-2 text-xs font-bold border-b " +
        (isOffline
          ? "bg-destructive/15 text-destructive border-destructive/30"
          : "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700/40")
      }
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span>{label}</span>
      <span className="text-[11px] font-normal opacity-80 truncate">— {hint}</span>
    </div>
  );
}

/**
 * Inline freshness warning for cards that are showing cached / stale data
 * because a live fetch failed. Use sparingly on result/list cards.
 */
export function StaleDataChip({ updatedAt }: { updatedAt?: string | number | Date | null }) {
  const { t } = useTranslation();
  const when = updatedAt ? new Date(updatedAt) : null;
  const ageMin = when ? Math.max(0, Math.round((Date.now() - when.getTime()) / 60000)) : null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200 px-2 py-0.5 text-[11px] font-bold">
      <CloudOff className="h-3 w-3" aria-hidden />
      {t("network.staleData", "البيانات غير محدثة")}
      {ageMin != null && ageMin > 0 ? ` · ${ageMin}m` : null}
    </span>
  );
}
