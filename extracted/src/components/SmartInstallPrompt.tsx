import { useEffect, useMemo, useState } from "react";
import { Download, Share2, X } from "lucide-react";
import { trackGrowthEvent } from "@/marketing/lib/growth";
import {
  getRecentInstallValueMoment,
  INSTALL_VALUE_MOMENT_EVENT,
  type InstallValueMomentDetail,
  type InstallValueMomentReason,
} from "@/lib/installPrompt";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISSED_KEY = "mwasalat_install_prompt_dismissed_at";
const INSTALLED_KEY = "mwasalat_pwa_installed";
const SHOWN_FOR_KEY = "mwasalat_install_prompt_shown_for";
const DISMISS_COOLDOWN_MS = 1000 * 60 * 60 * 24 * 7;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)")?.matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIosLike(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function wasRecentlyDismissed(): boolean {
  if (typeof window === "undefined") return true;
  const dismissedAt = Number(localStorage.getItem(DISMISSED_KEY) || 0);
  return dismissedAt > 0 && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
}

function copyForReason(reason: InstallValueMomentReason | null) {
  if (reason === "route_shared") {
    return {
      title: "ثبّته وخلي مشاويرك محفوظة.",
      body: "بعد ما شاركت أول طريق، ثبّت مواصلات عشان ترجعله وتبعته للجروب بضغطة واحدة.",
      cta: "ثبّت التطبيق",
    };
  }
  return {
    title: "ثبّت مواصلات عشان تعرف طريقك بضغطة واحدة كل يوم.",
    body: "شفت الوقت والتكلفة والزحمة؟ خليه على شاشة الموبايل لخطك اليومي بدل ما تدور كل مرة.",
    cta: "ثبّت مواصلات",
  };
}

export function SmartInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [reason, setReason] = useState<InstallValueMomentReason | null>(null);
  const [manualIos, setManualIos] = useState(false);
  const copy = useMemo(() => copyForReason(reason), [reason]);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      localStorage.setItem(INSTALLED_KEY, "1");
      setVisible(false);
      void trackGrowthEvent("app_installed", { source: "browser_appinstalled" });
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    const maybeShow = (detail: InstallValueMomentDetail | null) => {
      if (!detail) return;
      if (isStandalone() || localStorage.getItem(INSTALLED_KEY) === "1" || wasRecentlyDismissed()) return;

      const shownForKey = `${detail.reason}:${JSON.stringify(detail.properties ?? {})}`;
      if (localStorage.getItem(SHOWN_FOR_KEY) === shownForKey) return;
      localStorage.setItem(SHOWN_FOR_KEY, shownForKey);

      setReason(detail.reason);
      setManualIos(!deferredPrompt && isIosLike());
      setVisible(true);
      void trackGrowthEvent("app_install_prompt_shown", {
        reason: detail.reason,
        has_native_prompt: Boolean(deferredPrompt),
        ios_manual: !deferredPrompt && isIosLike(),
        ...detail.properties,
      });
    };

    const onValueMoment = (event: Event) => {
      maybeShow((event as CustomEvent<InstallValueMomentDetail>).detail);
    };

    window.addEventListener(INSTALL_VALUE_MOMENT_EVENT, onValueMoment);
    const recent = getRecentInstallValueMoment();
    if (recent) window.setTimeout(() => maybeShow(recent), 900);

    return () => window.removeEventListener(INSTALL_VALUE_MOMENT_EVENT, onValueMoment);
  }, [deferredPrompt]);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setVisible(false);
    void trackGrowthEvent("app_install_prompt_dismissed", { reason, placement: "post_value" });
  };

  const install = async () => {
    void trackGrowthEvent("app_install_prompt_clicked", { reason, has_native_prompt: Boolean(deferredPrompt), manual_ios: manualIos });
    if (!deferredPrompt) {
      setManualIos(true);
      return;
    }
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (choice.outcome === "accepted") {
      localStorage.setItem(INSTALLED_KEY, "1");
      setVisible(false);
      void trackGrowthEvent("app_installed", { reason, source: "beforeinstallprompt", platform: choice.platform });
    } else {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
      setVisible(false);
      void trackGrowthEvent("app_install_prompt_dismissed", { reason, placement: "native_choice", platform: choice.platform });
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border-2 border-secondary bg-surface p-4 shadow-2xl" dir="rtl">
      <button
        type="button"
        onClick={dismiss}
        className="absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-surface-alt text-secondary hover:bg-muted"
        aria-label="إغلاق دعوة التثبيت"
      >
        <X className="h-4 w-4" strokeWidth={2.5} />
      </button>
      <div className="flex items-start gap-3 pe-8">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-secondary border-2 border-secondary shadow-tactile-sm">
          <Download className="h-5 w-5" strokeWidth={2.5} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-black leading-tight text-secondary">{copy.title}</p>
          <p className="mt-1 text-sm font-semibold leading-relaxed text-muted-foreground">{copy.body}</p>
        </div>
      </div>
      {manualIos && !deferredPrompt && (
        <div className="mt-3 rounded-xl border border-secondary/30 bg-primary/40 p-3 text-xs font-bold leading-relaxed text-secondary">
          على iPhone: اضغط زر المشاركة <Share2 className="mx-1 inline h-3.5 w-3.5" /> ثم اختار “Add to Home Screen”.
        </div>
      )}
      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
        <button type="button" onClick={install} className="btn-primary !h-11 !text-sm">
          {copy.cta}
        </button>
        <button type="button" onClick={dismiss} className="btn-secondary !h-11 !px-4 !text-sm">
          بعدين
        </button>
      </div>
    </div>
  );
}
