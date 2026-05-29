/**
 * Lightweight performance instrumentation for key user flows.
 *
 * Uses the standard `performance.mark` / `performance.measure` API so timings
 * show up in Chrome DevTools Performance and any Real User Monitoring layer.
 * Forwards spans to Sentry when enabled, otherwise records locally only.
 *
 * Zero behavior change: every helper is best-effort and swallows errors.
 */
import { logger } from "./logger";
import { withSpan } from "./sentry";

const PREFIX = "tarif:";

function safePerformance(): Performance | null {
  if (typeof performance === "undefined") return null;
  if (typeof performance.mark !== "function") return null;
  return performance;
}

export function mark(name: string): void {
  const p = safePerformance();
  if (!p) return;
  try {
    p.mark(`${PREFIX}${name}`);
  } catch { /* noop */ }
}

/**
 * Measure between two marks (or from a single start mark to "now").
 * Returns the duration in milliseconds, or null if measurement failed.
 */
export function measure(name: string, startMark: string, endMark?: string): number | null {
  const p = safePerformance();
  if (!p) return null;
  try {
    const entry = p.measure(
      `${PREFIX}${name}`,
      `${PREFIX}${startMark}`,
      endMark ? `${PREFIX}${endMark}` : undefined,
    );
    const duration = entry?.duration ?? null;
    if (duration != null) {
      logger.debug(`perf.${name}`, { scope: "perf", durationMs: Math.round(duration) });
    }
    return duration;
  } catch {
    return null;
  }
}

/**
 * Time an async user flow end-to-end. Records a perf measure AND a Sentry span
 * (when Sentry is enabled). Always returns the underlying promise's result —
 * never swallows errors from the wrapped function.
 *
 * @example
 *   await timeFlow("planner.search", () => runPlanner(input))
 */
export async function timeFlow<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
  const start = `${name}.start`;
  const end = `${name}.end`;
  mark(start);
  try {
    return await withSpan(name, "user.flow", fn);
  } finally {
    mark(end);
    measure(name, start, end);
  }
}

/** Synchronous variant — no Sentry span, just a perf measure. */
export function timeSync<T>(name: string, fn: () => T): T {
  const start = `${name}.start`;
  const end = `${name}.end`;
  mark(start);
  try {
    return fn();
  } finally {
    mark(end);
    measure(name, start, end);
  }
}

/** Web Vitals: capture First Contentful Paint once if available. */
export function recordBootMetrics(): void {
  const p = safePerformance();
  if (!p || typeof PerformanceObserver === "undefined") return;
  try {
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "first-contentful-paint") {
          logger.info("perf.fcp", { scope: "perf", durationMs: Math.round(entry.startTime) });
          obs.disconnect();
        }
      }
    });
    obs.observe({ type: "paint", buffered: true });
  } catch { /* noop */ }
}
