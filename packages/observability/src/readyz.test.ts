import { describe, it, expect, vi } from "vitest";
import { runReadiness } from "./readyz.js";

describe("runReadiness", () => {
  it("returns ok=true when all checks pass", async () => {
    const r = await runReadiness("test", [
      { name: "a", check: () => Promise.resolve() },
      { name: "b", check: () => Promise.resolve() }
    ]);
    expect(r.ok).toBe(true);
    expect(r.service).toBe("test");
    expect(r.checks).toHaveLength(2);
    expect(r.checks.every((c) => c.ok)).toBe(true);
  });

  it("returns ok=false if at least one check throws, and includes error message", async () => {
    const r = await runReadiness("test", [
      { name: "good", check: () => Promise.resolve() },
      {
        name: "bad",
        check: () => Promise.reject(new Error("db down"))
      }
    ]);
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.name === "good")?.ok).toBe(true);
    const bad = r.checks.find((c) => c.name === "bad");
    expect(bad?.ok).toBe(false);
    expect(bad?.error).toBe("db down");
  });

  it("times out a slow check and reports it as failed", async () => {
    vi.useFakeTimers();
    const promise = runReadiness("test", [
      {
        name: "slow",
        timeoutMs: 100,
        check: () => new Promise(() => undefined) // never resolves
      }
    ]);
    await vi.advanceTimersByTimeAsync(150);
    const r = await promise;
    vi.useRealTimers();

    expect(r.ok).toBe(false);
    expect(r.checks[0]?.error).toBe("timeout");
  });

  it("runs all checks in parallel (not sequentially)", async () => {
    const started = Date.now();
    const slowMs = 50;
    const r = await runReadiness("test", [
      { name: "a", check: () => new Promise<void>((res) => setTimeout(res, slowMs)) },
      { name: "b", check: () => new Promise<void>((res) => setTimeout(res, slowMs)) },
      { name: "c", check: () => new Promise<void>((res) => setTimeout(res, slowMs)) }
    ]);
    const elapsed = Date.now() - started;
    expect(r.ok).toBe(true);
    // Если бы они шли последовательно — 150ms+; параллельно укладываемся в ~slowMs+overhead.
    expect(elapsed).toBeLessThan(slowMs * 2);
  });

  it("captures non-Error throw as string", async () => {
    const r = await runReadiness("test", [
      {
        name: "weird",
        // Намеренно бросаем не-Error чтобы проверить fallback-сериализацию.
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        check: () => Promise.reject("just a string")
      }
    ]);
    expect(r.checks[0]?.error).toBe("just a string");
  });

  it("handles empty checks array gracefully", async () => {
    const r = await runReadiness("test", []);
    expect(r.ok).toBe(true);
    expect(r.checks).toEqual([]);
  });
});
