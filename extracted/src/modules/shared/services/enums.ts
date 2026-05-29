// Central enum constants. Source of truth for the frontend domain model.
// The self-hosted backend may use different internal enum keys; callers should
// use the mapping helpers below at the service boundary.

export const LINE_STATUSES = ["active", "crowded", "stopped"] as const;
export type LineStatusValue = (typeof LINE_STATUSES)[number];

export const DRAFT_STATUSES = ["pending", "approved", "rejected", "applied"] as const;
export type DraftStatusValue = (typeof DRAFT_STATUSES)[number];

export const VEHICLE_TYPES = ["ميكروباص", "أتوبيس", "ميني باص", "تاكسي موقف"] as const;
export type VehicleTypeValue = (typeof VEHICLE_TYPES)[number];

export const APP_ROLES = ["passenger", "platform_owner", "station_operator", "platform_admin", "support_agent"] as const;
export type AppRoleValue = (typeof APP_ROLES)[number];

export const PLATFORM_ROLES = ["platform_owner", "platform_admin", "support_agent"] as const;
export type PlatformRoleValue = (typeof PLATFORM_ROLES)[number];

export const TENANT_ROLES = ["tenant_owner", "tenant_admin", "ops_manager", "station_manager", "line_supervisor", "viewer"] as const;
export type TenantRoleValue = (typeof TENANT_ROLES)[number];

export function fromBackendLineStatus(input: unknown): LineStatusValue | undefined {
  if (input === undefined || input === null || input === "") return undefined;
  const s = String(input).trim().toLowerCase();
  if (s === "paused") return "crowded";
  if (s === "closed") return "stopped";
  return coerceLineStatus(s);
}

export function toBackendLineStatus(input: unknown): "active" | "paused" | "closed" | undefined {
  const status = coerceLineStatus(input);
  if (!status) return undefined;
  if (status === "crowded") return "paused";
  if (status === "stopped") return "closed";
  return "active";
}

export function fromBackendVehicleType(input: unknown): VehicleTypeValue | undefined {
  if (input === undefined || input === null || input === "") return undefined;
  const s = String(input).trim();
  if (s === "microbus" || s === "ميكروباص") return "ميكروباص";
  if (s === "bus" || s === "أتوبيس") return "أتوبيس";
  if (s === "minibus" || s === "ميني_باص" || s === "ميني باص") return "ميني باص";
  if (s === "taxi" || s === "تاكسي" || s === "تاكسي موقف") return "تاكسي موقف";
  return undefined;
}

export function toBackendVehicleType(input: unknown): "microbus" | "bus" | "minibus" | "taxi" | undefined {
  const v = fromBackendVehicleType(input);
  if (!v) return undefined;
  switch (v) {
    case "ميكروباص":
      return "microbus";
    case "أتوبيس":
      return "bus";
    case "ميني باص":
      return "minibus";
    case "تاكسي موقف":
      return "taxi";
  }
}

/** Coerce any input (including legacy values and backend enum variants) to a
 * valid frontend `line_status`. Returns `undefined` for blank/unknown input. */
export function coerceLineStatus(input: unknown): LineStatusValue | undefined {
  if (input === undefined || input === null || input === "") return undefined;
  if (typeof input === "boolean") return input ? "active" : "stopped";
  const s = String(input).trim().toLowerCase();
  if (
    s === "inactive" ||
    s === "off" ||
    s === "false" ||
    s === "موقوف" ||
    s === "متوقف" ||
    s === "closed"
  ) {
    return "stopped";
  }
  if (s === "busy" || s === "زحمة" || s === "مزدحم" || s === "paused") return "crowded";
  if ((LINE_STATUSES as readonly string[]).includes(s)) return s as LineStatusValue;
  return undefined;
}

/** Throws if the value is not a valid frontend line_status. */
export function assertLineStatus(value: unknown, context = "line.status"): LineStatusValue {
  const coerced = coerceLineStatus(value);
  if (!coerced) {
    throw new Error(
      `قيمة غير صالحة لـ ${context}: ${JSON.stringify(value)}. القيم المسموحة: ${LINE_STATUSES.join(", ")}.`,
    );
  }
  return coerced;
}

export function isLineStatus(value: unknown): value is LineStatusValue {
  return typeof value === "string" && (LINE_STATUSES as readonly string[]).includes(value);
}

export function isDraftStatus(value: unknown): value is DraftStatusValue {
  return typeof value === "string" && (DRAFT_STATUSES as readonly string[]).includes(value);
}

export function isVehicleType(value: unknown): value is VehicleTypeValue {
  return typeof value === "string" && (VEHICLE_TYPES as readonly string[]).includes(value);
}

/** Arabic display label for a line_status. */
export function lineStatusLabel(status: unknown): string {
  switch (coerceLineStatus(status)) {
    case "active":
      return "نشط";
    case "crowded":
      return "زحمة";
    case "stopped":
      return "موقوف";
    default:
      return "غير معروف";
  }
}
