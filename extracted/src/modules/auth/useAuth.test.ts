import { describe, expect, it } from "vitest";
import { hasRole } from "@/modules/auth/useAuth";

describe("hasRole guard", () => {
  it("returns false when user has no roles", () => {
    expect(hasRole([], "platform_admin")).toBe(false);
    expect(hasRole([], ["platform_admin", "station_operator"])).toBe(false);
  });

  it("matches a single required role", () => {
    expect(hasRole(["passenger"], "passenger")).toBe(true);
    expect(hasRole(["passenger"], "platform_admin")).toBe(false);
  });

  it("matches when ANY of the required roles is held (OR semantics)", () => {
    expect(hasRole(["station_operator"], ["station_operator", "platform_admin"])).toBe(true);
    expect(hasRole(["passenger"], ["station_operator", "platform_admin"])).toBe(false);
  });

  it("does not grant admin to operator-only users", () => {
    // Critical: admin-only routes must not leak to operators.
    expect(hasRole(["station_operator"], "platform_admin")).toBe(false);
  });

  it("works with multiple held roles", () => {
    expect(hasRole(["passenger", "station_operator"], "station_operator")).toBe(true);
  });
});
