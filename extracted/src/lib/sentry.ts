/**
 * Sentry bootstrap. **Zero behavior change when no DSN is configured.**
 *
 * Activation:
 *   - Set `VITE_SENTRY_DSN` at build time. Without it, `initSentry()` is a no-op
 *     and `captureException`/`captureMessage` quietly fall back to the local logger.
 *
 * Hard guards (never initialize Sentry in these contexts):
 *   - Lovable editor preview iframes
 *   - Lovable preview hostnames (id-preview--*, *.lovableproject.com, *.lovable.app)
 *   - Test runners (vitest)
 *
 * The Capacitor wrapper is treated as a normal production host.
 */
import * as Sentry from "@sentry/react";
import { ENV } from "./env";

let initialized = false;

function shouldSkipInit(): boolean {
  if (typeof window === "undefined") return true;
  // Vitest / jsdom — never init.
  if ((import.meta as any)?.env?.MODE === "test") return true;

  const isInIframe = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();

  const host = window.location.hostname;
  const isPreviewHost =
    host.includes("id-preview--") ||
    host.endsWith(".lovableproject.com") ||
    host.endsWith(".lovable.app");

  // Capacitor shells should still report errors in production.
  const isCapacitor =
    window.location.protocol === "capacitor:" ||
    window.location.protocol === "file:" ||
    // @ts-expect-error - Capacitor injects this global at runtime
    typeof window.Capacitor !== "undefined";

  if (isCapacitor) return false;
  return isInIframe || isPreviewHost;
}

export function initSentry(): void {
  if (initialized) return;
  if (!ENV.sentryDsn) return;
  if (shouldSkipInit()) return;

  try {
    Sentry.init({
      dsn: ENV.sentryDsn,
      environment: ENV.isProd ? "production" : ENV.mode,
      release: ENV.release,
      // Conservative defaults — never spam Sentry from a passenger app.
      tracesSampleRate: ENV.isProd ? 0.1 : 0.0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: ENV.isProd ? 0.1 : 0.0,
      // Don't break the app if Sentry transport fails.
      sendClientReports: false,
      // Strip query strings from breadcrumbs — they may contain station ids etc.
      beforeBreadcrumb(crumb) {
        if (crumb.category === "fetch" || crumb.category === "xhr") {
          if (typeof crumb.data?.url === "string") {
            crumb.data.url = crumb.data.url.split("?")[0];
          }
        }
        return crumb;
      },
    });
    initialized = true;
  } catch {
    /* never let Sentry crash the app */
  }
}

export function isSentryEnabled(): boolean {
  return initialized;
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  try {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch { /* noop */ }
}

export function captureMessage(message: string, level: Sentry.SeverityLevel, context?: Record<string, unknown>): void {
  if (!initialized) return;
  try {
    Sentry.captureMessage(message, { level, extra: context });
  } catch { /* noop */ }
}

/**
 * Wrap an async user flow in a Sentry span. Falls back to plain execution
 * when Sentry isn't initialized — callers don't need to branch.
 */
export async function withSpan<T>(
  name: string,
  op: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  if (!initialized) return await fn();
  return Sentry.startSpan({ name, op }, async () => await fn());
}
