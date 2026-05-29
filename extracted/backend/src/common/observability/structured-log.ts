import { randomUUID } from "crypto";

export type StructuredLogLevel = "debug" | "info" | "warn" | "error";

export type StructuredLogPayload = Record<string, unknown> & {
  event: string;
  requestId?: string | null;
};

const SERVICE = "mwasalat-backend";
const LEVEL_ORDER: Record<StructuredLogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function currentLevel(): StructuredLogLevel {
  const raw = (process.env.LOG_LEVEL ?? "info").trim().toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  return "info";
}

function shouldEmit(level: StructuredLogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel()];
}

function safeString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function logStructured(level: StructuredLogLevel, payload: StructuredLogPayload): void {
  if (!shouldEmit(level)) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    service: SERVICE,
    release: process.env.APP_VERSION ?? "dev",
    requestId: payload.requestId ?? null,
    ...payload,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function normalizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: safeString(error), raw: error ?? null };
}

export function randomRequestId(): string {
  return randomUUID();
}
