import { describe, it, expect, vi } from "vitest";
import { mark, measure, timeFlow, timeSync } from "./perf";

describe("perf", () => {
  it("mark/measure does not throw and returns a finite duration when supported", () => {
    expect(() => mark("test.start")).not.toThrow();
    expect(() => mark("test.end")).not.toThrow();
    const d = measure("test", "test.start", "test.end");
    // jsdom supports performance.measure; duration should be a number ≥ 0
    if (d !== null) expect(d).toBeGreaterThanOrEqual(0);
  });

  it("timeFlow returns the wrapped function's resolved value", async () => {
    const result = await timeFlow("flow.x", async () => 42);
    expect(result).toBe(42);
  });

  it("timeFlow propagates errors", async () => {
    await expect(timeFlow("flow.err", async () => { throw new Error("boom"); }))
      .rejects.toThrow("boom");
  });

  it("timeSync returns the wrapped function's value", () => {
    expect(timeSync("sync.x", () => "v")).toBe("v");
  });

  it("measure returns null gracefully when marks are missing", () => {
    const d = measure("never", "missing.start", "missing.end");
    expect(d).toBeNull();
  });

  it("does not break when performance.mark throws", () => {
    const original = performance.mark;
    (performance as any).mark = vi.fn(() => { throw new Error("nope"); });
    try {
      expect(() => mark("x")).not.toThrow();
    } finally {
      (performance as any).mark = original;
    }
  });
});
