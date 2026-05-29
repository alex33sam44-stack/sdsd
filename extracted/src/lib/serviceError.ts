/**
 * Centralized error handling for data services.
 *
 * - `ServiceError`  : preserves the original cause and adds an Arabic-friendly
 *                     user-facing message that admin pages can render in toasts.
 * - `runService()`  : wraps any async service call so failures are logged once,
 *                     normalized into `ServiceError`, and rethrown.
 * - `logMutationFailure()` : best-effort write to `audit_logs` on a failed
 *                     admin mutation, so the audit trail captures attempted
 *                     destructive actions even when they don't land.
 */

import { logger, type LogContext } from "./logger";

export class ServiceError extends Error {
  /** Stable, non-localized identifier (e.g. "lines.update"). */
  readonly scope: string;
  /** Arabic message safe to show to admins in a toast. */
  readonly userMessage: string;
  /** Original error preserved for logs. */
  readonly cause: unknown;

  constructor(scope: string, userMessage: string, cause: unknown) {
    super(`${scope}: ${userMessage}`);
    this.name = "ServiceError";
    this.scope = scope;
    this.userMessage = userMessage;
    this.cause = cause;
  }
}

function defaultUserMessage(scope: string): string {
  if (scope.endsWith(".create")) return "تعذّر الإنشاء. حاول مرة أخرى.";
  if (scope.endsWith(".update")) return "تعذّر حفظ التعديلات.";
  if (scope.endsWith(".delete")) return "تعذّر الحذف.";
  if (scope.endsWith(".publish") || scope.endsWith(".unpublish"))
    return "تعذّر تغيير حالة النشر.";
  if (scope.startsWith("audit.")) return "تعذّر قراءة سجل الأحداث.";
  return "حدث خطأ أثناء الاتصال بالخادم.";
}

function pickMessage(err: unknown, scope: string): string {
  // Surface our domain validation errors verbatim (they're already Arabic).
  if (err instanceof ServiceError) return err.userMessage;
  if (err instanceof Error && /^[\u0600-\u06FF]/.test(err.message)) {
    return err.message;
  }
  return defaultUserMessage(scope);
}

/** Wrap an async service function. Logs once and throws a `ServiceError`. */
export async function runService<T>(
  scope: string,
  fn: () => Promise<T>,
  ctx: LogContext = {},
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const userMessage = pickMessage(err, scope);
    logger.error(`service ${scope} failed`, {
      scope,
      ...ctx,
      error: serializeError(err),
    });
    if (err instanceof ServiceError) throw err;
    throw new ServiceError(scope, userMessage, err);
  }
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      code: (err as any).code,
      details: (err as any).details,
      hint: (err as any).hint,
    };
  }
  if (err && typeof err === "object") return { ...(err as object) };
  return { value: String(err) };
}

/** Friendly Arabic message for any error caught at a UI boundary. */
export function toUserMessage(err: unknown): string {
  if (err instanceof ServiceError) return err.userMessage;
  if (err instanceof Error && /^[\u0600-\u06FF]/.test(err.message)) {
    return err.message;
  }
  return "حدث خطأ غير متوقع.";
}

/** Best-effort: record a failed admin mutation in the audit trail. Never
 *  throws — the original failure is what matters to the caller. */
export async function logMutationFailure(input: {
  entity: string;
  entityId?: string | null;
  action: string;
  error: unknown;
}): Promise<void> {
  try {
    // Local structured log first — always.
    logger.error("admin mutation failed", {
      entity: input.entity,
      entityId: input.entityId ?? undefined,
      action: input.action,
      error: serializeError(input.error),
    });
    // Best-effort persistent record. Imported lazily to avoid a cycle with
    // services that depend on this module.
    const { logAudit } = await import("@/modules/shared/services/audit");
    await logAudit({
      entity: input.entity,
      entityId: input.entityId ?? undefined,
      action: `${input.action}_failed`,
      diff: { error: serializeError(input.error) },
    });
  } catch {
    /* swallow — never let logging crash the app */
  }
}

/** Convenience for admin mutations: runs the function via `runService`, and on
 *  failure also writes a best-effort `<action>_failed` audit row.
 *  `audit` is optional — pass it when the failure should appear in the audit
 *  trail (i.e. the user attempted a destructive admin action). */
export async function runMutation<T>(
  scope: string,
  fn: () => Promise<T>,
  audit?: { entity: string; entityId?: string | null; action: string },
): Promise<T> {
  try {
    return await runService(scope, fn, audit);
  } catch (err) {
    if (audit) {
      // Fire and forget — already logged once by runService.
      void logMutationFailure({ ...audit, error: err });
    }
    throw err;
  }
}
