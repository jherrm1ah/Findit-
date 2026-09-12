import { describe, it, expect, vi, beforeEach } from "vitest";

// getDb is mocked so the shared-counter path can be exercised without a
// database, including the failure path that decides whether a database
// problem locks every user out.
const rpc = vi.fn();
vi.mock("./db", () => ({
  getDb: () => ({ rpc }),
}));

const { checkRateLimit, checkRateLimitInMemory, getClientIp } = await import("./rateLimit");

beforeEach(() => {
  rpc.mockReset();
});

describe("checkRateLimitInMemory — the fallback", () => {
  it("allows up to the max attempts, then blocks", () => {
    const key = "test:" + Math.random();
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimitInMemory(key, 3, 60_000).allowed).toBe(true);
    }
    const blocked = checkRateLimitInMemory(key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks separate keys independently", () => {
    const keyA = "test-a:" + Math.random();
    const keyB = "test-b:" + Math.random();
    checkRateLimitInMemory(keyA, 1, 60_000);
    expect(checkRateLimitInMemory(keyA, 1, 60_000).allowed).toBe(false);
    expect(checkRateLimitInMemory(keyB, 1, 60_000).allowed).toBe(true);
  });

  it("allows attempts again once the window has passed", async () => {
    const key = "test-window:" + Math.random();
    expect(checkRateLimitInMemory(key, 1, 50).allowed).toBe(true);
    expect(checkRateLimitInMemory(key, 1, 50).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(checkRateLimitInMemory(key, 1, 50).allowed).toBe(true);
  });
});

describe("checkRateLimit — the shared counter", () => {
  it("uses the database's decision, not a local count", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: false, retry_after_seconds: 42 }], error: null });

    const result = await checkRateLimit("login:1.2.3.4:+2348012345678", 5, 15 * 60_000);

    expect(result).toEqual({ allowed: false, retryAfterSeconds: 42 });
    expect(rpc).toHaveBeenCalledWith("check_rate_limit", {
      p_key: "login:1.2.3.4:+2348012345678",
      p_max: 5,
      // Milliseconds at the call site, seconds in the database function.
      p_window_seconds: 900,
    });
  });

  it("allows the request when the database says it is under the limit", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null });

    expect(await checkRateLimit("order:u_1", 10, 60_000)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  it("never rounds a sub-second window down to zero", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null });

    await checkRateLimit("k", 1, 200);

    expect(rpc).toHaveBeenCalledWith("check_rate_limit", expect.objectContaining({ p_window_seconds: 1 }));
  });

  it("falls back to per-instance counting when the database errors", async () => {
    // Failing closed here would turn a database hiccup into "nobody can log
    // in". Weak counting beats no service.
    rpc.mockResolvedValue({ data: null, error: { message: "relation does not exist" } });

    const key = "fallback:" + Math.random();
    expect((await checkRateLimit(key, 1, 60_000)).allowed).toBe(true);
    expect((await checkRateLimit(key, 1, 60_000)).allowed).toBe(false);
  });

  it("falls back when the call throws outright", async () => {
    rpc.mockRejectedValue(new Error("network down"));

    const key = "fallback-throw:" + Math.random();
    expect((await checkRateLimit(key, 1, 60_000)).allowed).toBe(true);
    expect((await checkRateLimit(key, 1, 60_000)).allowed).toBe(false);
  });

  it("falls back rather than trusting an unexpected response shape", async () => {
    rpc.mockResolvedValue({ data: [{ nonsense: true }], error: null });

    expect((await checkRateLimit("shape:" + Math.random(), 1, 60_000)).allowed).toBe(true);
  });
});

describe("getClientIp", () => {
  function req(headers: Record<string, string>, ip?: string) {
    return {
      ip,
      headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    } as never;
  }

  it("prefers the platform-provided address over the forgeable header", () => {
    expect(getClientIp(req({ "x-forwarded-for": "9.9.9.9" }, "1.2.3.4"))).toBe("1.2.3.4");
  });

  it("falls back to the first entry of x-forwarded-for", () => {
    expect(getClientIp(req({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
  });

  it("normalises the colons out of an IPv6 address", () => {
    // Rate-limit keys are colon-separated ('login:<ip>:<phone>'), so a raw
    // IPv6 address makes a key that another caller could also construct —
    // two callers sharing one bucket, or one aimed at another's.
    expect(getClientIp(req({}, "2001:db8::1"))).toBe("2001_db8__1");
  });

  it("caps the length, since the header is attacker-influenced", () => {
    expect(getClientIp(req({ "x-forwarded-for": "a".repeat(500) })).length).toBe(100);
  });

  it("returns a stable placeholder when there is no address at all", () => {
    expect(getClientIp(req({}))).toBe("unknown");
  });
});
