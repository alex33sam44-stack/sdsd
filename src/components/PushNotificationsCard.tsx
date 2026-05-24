import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BellRing, BellOff, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import {
  disablePush,
  enablePush,
  getPushSupportLevel,
  sendPushSelfTest,
  type PushSupport,
} from "@/lib/push";
import { tokenStore } from "@/lib/api";

/**
 * Self-contained push-notifications card for the Settings page.
 *
 * Hides itself entirely when the browser, the user's permission, or the
 * backend's VAPID config can't deliver pushes — so users never see a
 * toggle that wouldn't actually do anything.
 */
export function PushNotificationsCard() {
  const { t } = useTranslation();
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const next = await getPushSupportLevel();
      setSupport(next);
    } catch {
      setSupport({ state: "unsupported", reason: "no-push-manager" });
    }
  };

  useEffect(() => {
    void refresh();
    // Re-probe when the auth state changes — subscribing requires the JWT
    // because /push/subscriptions is gated by JwtAuthGuard.
    return tokenStore.subscribe(() => {
      void refresh();
    });
  }, []);

  // Hide the card altogether when there's nothing the user can do.
  if (!support) return null;
  if (support.state === "unsupported") return null;
  if (support.state === "server-disabled") return null;

  const isSubscribed = support.state === "granted" && support.subscribed;

  const handleEnable = async () => {
    setBusy(true);
    const result = await enablePush();
    setBusy(false);
    if (result.ok) {
      toast.success(t("push.subscribed"));
      void refresh();
    } else if (result.reason === "denied") {
      toast.error(t("push.denied"));
      void refresh();
    } else if (result.reason === "server-disabled") {
      toast.error(t("push.serverDisabled"));
    } else {
      toast.error(t("push.failed"));
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    const result = await disablePush();
    setBusy(false);
    if (result.ok) {
      toast.success(t("push.unsubscribed"));
    }
    void refresh();
  };

  const handleTest = async () => {
    setBusy(true);
    const result = await sendPushSelfTest();
    setBusy(false);
    if (result.ok) toast.success(t("push.testSent"));
    else toast.error(t("push.failed"));
  };

  const description =
    support.state === "denied"
      ? t("push.denied")
      : isSubscribed
        ? t("push.enabled")
        : t("push.description");

  return (
    <div className="rounded-xl border-2 border-secondary bg-surface p-4 shadow-tactile-sm space-y-3">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary border-2 border-secondary p-2 shadow-tactile-sm">
          {isSubscribed ? (
            <BellRing className="h-5 w-5 text-secondary" />
          ) : (
            <BellOff className="h-5 w-5 text-secondary" />
          )}
        </div>
        <div className="flex-1">
          <h2 className="font-black text-secondary text-lg leading-tight">
            {t("push.title")}
          </h2>
          <p className="text-sm text-muted-foreground font-semibold leading-relaxed mt-1">
            {description}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {!isSubscribed && support.state !== "denied" && (
          <button
            type="button"
            onClick={handleEnable}
            disabled={busy}
            className="h-11 rounded-lg border-2 border-secondary bg-secondary text-secondary-foreground font-black flex items-center justify-center gap-2 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <BellRing className="h-5 w-5" strokeWidth={2.5} />}
            <span>{t("push.enable")}</span>
          </button>
        )}
        {isSubscribed && (
          <>
            <button
              type="button"
              onClick={handleTest}
              disabled={busy}
              className="h-11 rounded-lg border-2 border-secondary bg-surface-alt text-secondary font-black flex items-center justify-center gap-2 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" strokeWidth={2.5} />}
              <span>{t("push.test")}</span>
            </button>
            <button
              type="button"
              onClick={handleDisable}
              disabled={busy}
              className="h-11 rounded-lg border-2 border-secondary bg-surface text-secondary font-black flex items-center justify-center gap-2 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <BellOff className="h-5 w-5" strokeWidth={2.5} />}
              <span>{t("push.disable")}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default PushNotificationsCard;
