import { describe, it, expect } from "vitest";
import { checkRateLimit } from "./rateLimit";

describe("checkRateLimit", () => {
  it("allows up to the max attempts, then blocks", () => {
    const key = "test:" + Math.random();
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);
    }
    const blocked = checkRateLimit(key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks separate keys independently", () => {
    const keyA = "test-a:" + Math.random();
    const keyB = "test-b:" + Math.random();
    checkRateLimit(keyA, 1, 60_000);
    expect(checkRateLimit(keyA, 1, 60_000).allowed).toBe(false);
    expect(checkRateLimit(keyB, 1, 60_000).allowed).toBe(true);
  });

  it("allows attempts again once the window has passed", async () => {
    const key = "test-window:" + Math.random();
    expect(checkRateLimit(key, 1, 50).allowed).toBe(true);
    expect(checkRateLimit(key, 1, 50).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(checkRateLimit(key, 1, 50).allowed).toBe(true);
  });
});
