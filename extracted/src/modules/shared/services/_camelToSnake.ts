/**
 * Convert backend (Prisma camelCase) payloads into the snake_case shape that
 * existing UI/types expect.
 *
 * Pure, recursive, type-erased. Acceptable cost for passenger reads;
 * we apply it only at the service boundary so consumers stay unchanged.
 */

import { fromBackendLineStatus, fromBackendVehicleType } from "./enums";

const NUMERIC_KEYS = new Set([
  "lat",
  "lng",
  "zone_x",
  "zone_y",
  "zone_w",
  "zone_h",
  "x",
  "y",
  "w",
  "h",
  "cars",
  "position",
  "result_count",
]);

function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function normalizeValue(key: string, value: unknown): unknown {
  if (key === "status" && typeof value === "string") {
    return fromBackendLineStatus(value) ?? value;
  }
  if (key === "vehicle_type" && typeof value === "string") {
    return fromBackendVehicleType(value) ?? value;
  }
  return value;
}

export function snakify<T = unknown>(input: unknown): T {
  if (input === null || input === undefined) return input as T;
  if (Array.isArray(input)) return input.map((v) => snakify(v)) as unknown as T;
  if (typeof input !== "object") return input as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const sk = toSnake(k);
    let val: unknown = v && typeof v === "object" ? snakify(v) : v;
    if (NUMERIC_KEYS.has(sk) && val !== null && typeof val === "string") {
      const n = Number(val);
      if (Number.isFinite(n)) val = n;
    }
    out[sk] = normalizeValue(sk, val);
  }
  return out as T;
}
