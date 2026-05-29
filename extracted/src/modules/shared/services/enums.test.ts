import { describe, expect, it } from "vitest";
import {
  LINE_STATUSES,
  coerceLineStatus,
  assertLineStatus,
  isLineStatus,
  lineStatusLabel,
} from "@/modules/shared/services/enums";

describe("line_status enum mapping", () => {
  it("exposes the exact DB enum values, in order", () => {
    expect(LINE_STATUSES).toEqual(["active", "crowded", "stopped"]);
  });

  it("never produces the obsolete `inactive` value", () => {
    // Legacy data may still contain `"inactive"` — it must coerce to `stopped`
    // (the DB equivalent), never pass through.
    expect(coerceLineStatus("inactive")).toBe("stopped");
    expect(LINE_STATUSES).not.toContain("inactive" as never);
  });

  it("coerces booleans, Arabic synonyms and aliases", () => {
    expect(coerceLineStatus(true)).toBe("active");
    expect(coerceLineStatus(false)).toBe("stopped");
    expect(coerceLineStatus("ACTIVE")).toBe("active");
    expect(coerceLineStatus("موقوف")).toBe("stopped");
    expect(coerceLineStatus("زحمة")).toBe("crowded");
    expect(coerceLineStatus("busy")).toBe("crowded");
  });

  it("returns undefined for blank/unknown so callers can decide a default", () => {
    expect(coerceLineStatus(undefined)).toBeUndefined();
    expect(coerceLineStatus(null)).toBeUndefined();
    expect(coerceLineStatus("")).toBeUndefined();
    expect(coerceLineStatus("nonsense")).toBeUndefined();
  });

  it("assertLineStatus throws on truly invalid input", () => {
    expect(() => assertLineStatus("nonsense")).toThrowError(/lines\.status|line\.status/);
    expect(() => assertLineStatus(undefined)).toThrow();
  });

  it("isLineStatus is a strict guard (no coercion)", () => {
    expect(isLineStatus("active")).toBe(true);
    expect(isLineStatus("inactive")).toBe(false);
    expect(isLineStatus("ACTIVE")).toBe(false);
  });

  it("lineStatusLabel returns Arabic labels for every enum value", () => {
    expect(lineStatusLabel("active")).toBe("نشط");
    expect(lineStatusLabel("crowded")).toBe("زحمة");
    expect(lineStatusLabel("stopped")).toBe("موقوف");
    expect(lineStatusLabel("inactive")).toBe("موقوف"); // legacy → stopped
    expect(lineStatusLabel("nope")).toBe("غير معروف");
  });
});
