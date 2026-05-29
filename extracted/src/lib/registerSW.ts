/**
 * Service worker registration with strict guards.
 *
 * The SW MUST NOT register inside:
 *   - Lovable editor preview iframes (cross-origin or same-origin)
 *   - Lovable preview hostnames (id-preview--*, *.lovableproject.com,
 *     *.lovable.app for the editor)
 *
 * Reason: a registered SW caches stale builds and intercepts navigation,
 * which breaks the live preview and can serve outdated frontend code
 *
 * In all other contexts (production deploy on the user's own domain,
 * Capacitor Android shell, etc.) the SW registers normally via
 * vite-plugin-pwa's virtual module.
 */
export async function registerServiceWorker(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const isInIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true; // cross-origin → assume iframe
    }
  })();

  const host = window.location.hostname;
  const isPreviewHost =
    host.includes("id-preview--") ||
    host.endsWith(".lovableproject.com") ||
    host.endsWith(".lovable.app");

  // Capacitor Android/iOS shells use file:// or capacitor:// — always allow there.
  const isCapacitor =
    window.location.protocol === "capacitor:" ||
    window.location.protocol === "file:" ||
    // @ts-expect-error - capacitor adds this when the wrapper is active
    typeof window.Capacitor !== "undefined";

  if (!isCapacitor && (isInIframe || isPreviewHost)) {
    // Belt & suspenders: unregister any pre-existing SWs in preview/iframe.
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    } catch {
      /* noop */
    }
    return;
  }

  try {
    const { registerSW } = await import("virtual:pwa-register");
    registerSW({ immediate: true });
  } catch {
    /* PWA virtual module unavailable (e.g. tests) — ignore */
  }
}
