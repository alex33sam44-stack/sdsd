/**
 * Centralized logger. Wraps console with structured context and an optional
 * remote sink hook (no remote sink is shipped — wire one up by replacing
 * `remoteSink` if/when the user adds Sentry, Logflare, etc.).
 *
 * Use `logger.error(msg, ctx)` for failures. Service-layer code should prefer
 * `runService()` from `serviceError.ts` so errors are logged consistently.
 */

import { ENV } from "./env";
import { captureException, captureMessage, isSentryEnabled } from "./sentry";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown> & {
  scope?: string;
  /** Human-readable id of the entity acted on, when relevant. */
  entityId?: string;
  /** What kind of entity: "line", "station", etc. */
  entity?: string;
  /** Action verb: "create" | "update" | "delete" | "publish" | ... */
  action?: string;
};

type Sink = (level: LogLevel, message: string, ctx: LogContext) => void;

/** Forwards warn/error to Sentry once it has been initialized. */
const remoteSink: Sink = (level, message, ctx) => {
  if (!isSentryEnabled()) return;
  if (level === "error") {
    const err = (ctx as any)?.error;
    if (err instanceof Error) captureException(err, { message, ...ctx });
    else captureException(new Error(message), ctx);
  } else if (level === "warn") {
    captureMessage(message, "warning", ctx);
  }
};

function localSink(level: LogLevel, message: string, ctx: LogContext) {
  const payload = { level, release: ENV.release, mode: ENV.dataMode, ...ctx };
  const fn =
    level === "error" ? console.error :
    level === "warn"  ? console.warn  :
    level === "info"  ? console.info  :
    console.debug;
  fn(`[${level}] ${message}`, payload);
}

function emit(level: LogLevel, message: string, ctx: LogContext = {}) {
  // In production, suppress noisy debug logs — keep info/warn/error.
  if (ENV.isProd && level === "debug") return;
  localSink(level, message, ctx);
  try {
    remoteSink(level, message, ctx);
  } catch {
    /* never let a sink crash the app */
  }
}

export const logger = {
  debug: (m: string, c?: LogContext) => emit("debug", m, c),
  info:  (m: string, c?: LogContext) => emit("info",  m, c),
  warn:  (m: string, c?: LogContext) => emit("warn",  m, c),
  error: (m: string, c?: LogContext) => emit("error", m, c),
};
