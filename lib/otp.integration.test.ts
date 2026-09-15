import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";

// Exercises the REAL verifyOtp against the fake Supabase client. Covers the
// fix for a real brute-force bypass a security review found: the old
// attempts >= max_attempts check + a plain read-then-write increment was
// NOT atomic — concurrent wrong guesses all read the same stale `attempts`
// value and each wrote back stale+1, so N simultaneous guesses only ever
// cost the counter "+1" total, letting an attacker with enough concurrency
// brute-force past the 5-attempt cap on a 6-digit code. A password-reset
// OTP guessed this way is a real account takeover. The fix routes the cap
// through lib/rateLimit.ts#checkRateLimit instead (an atomic DB increment
// in production; here it falls back to the in-memory limiter, since the
// fake client has no .rpc() — see rateLimit.ts's own documented fallback).

const fakeDb: FakeSupabase = createFakeSupabase();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeDb,
}));

process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const { verifyOtp, hashOtpCode } = await import("./otp");

const REAL_CODE = "123456";

function seedOtp(id: string, overrides: Record<string, unknown> = {}) {
  const salt = "test-salt-" + id;
  return {
    otp_verifications: [
      {
        id,
        phone: "+2348012340001",
        purpose: "reset",
        otp_hash: hashOtpCode(REAL_CODE, salt),
        otp_salt: salt,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
        attempts: 0,
        max_attempts: 5,
        used: false,
        ...overrides,
      },
    ],
  };
}

beforeEach(() => {
  fakeDb.reset();
});

describe("verifyOtp — attempt cap actually caps at max_attempts", () => {
  it("refuses a 6th guess after 5 wrong ones, even sequentially with no concurrency involved", async () => {
    fakeDb.reset(seedOtp("otp_1"));
    for (let i = 0; i < 5; i++) {
      const result = await verifyOtp({ phone: "+2348012340001", purpose: "reset", code: "000000" });
      expect(result).toEqual({ ok: false, reason: "incorrect" });
    }
    const sixth = await verifyOtp({ phone: "+2348012340001", purpose: "reset", code: "000000" });
    expect(sixth).toEqual({ ok: false, reason: "too_many_attempts" });
  });

  it("still refuses further guesses even with the CORRECT code, once the cap is hit", async () => {
    fakeDb.reset(seedOtp("otp_2"));
    for (let i = 0; i < 5; i++) {
      await verifyOtp({ phone: "+2348012340001", purpose: "reset", code: "000000" });
    }
    const attempt = await verifyOtp({ phone: "+2348012340001", purpose: "reset", code: REAL_CODE });
    expect(attempt).toEqual({ ok: false, reason: "too_many_attempts" });
  });

  it("accepts the correct code before the cap is reached", async () => {
    fakeDb.reset(seedOtp("otp_3"));
    await verifyOtp({ phone: "+2348012340001", purpose: "reset", code: "000000" });
    await verifyOtp({ phone: "+2348012340001", purpose: "reset", code: "111111" });
    const result = await verifyOtp({ phone: "+2348012340001", purpose: "reset", code: REAL_CODE });
    expect(result).toEqual({ ok: true });
  });

  it("gives a fresh attempt budget to a different OTP record (a newly-sent code)", async () => {
    // Simulates: attacker exhausts one code's real attempt budget, a fresh
    // code is then requested/sent — the new code must not inherit the old
    // one's exhausted counter (it's a different random value; a fresh
    // budget against it is correct, not a bypass, since guesses against the
    // OLD code never helped find the NEW one anyway). The cap is keyed to
    // the OTP row's id (lib/otp.ts), so a genuinely different row — not
    // just a seeded `attempts` column, which is cosmetic post-fix — is what
    // actually proves this.
    fakeDb.reset(seedOtp("otp_old"));
    for (let i = 0; i < 5; i++) {
      await verifyOtp({ phone: "+2348012340001", purpose: "reset", code: "000000" });
    }
    const stillCapped = await verifyOtp({ phone: "+2348012340001", purpose: "reset", code: "000000" });
    expect(stillCapped).toEqual({ ok: false, reason: "too_many_attempts" });

    fakeDb.reset(seedOtp("otp_new"));
    const fresh = await verifyOtp({ phone: "+2348012340001", purpose: "reset", code: REAL_CODE });
    expect(fresh).toEqual({ ok: true });
  });
});

describe("verifyOtp — expiry and not-found", () => {
  it("refuses an expired code", async () => {
    fakeDb.reset(seedOtp("otp_expired", { expires_at: new Date(Date.now() - 1000).toISOString() }));
    const result = await verifyOtp({ phone: "+2348012340001", purpose: "reset", code: REAL_CODE });
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("refuses when there's no active code for this phone/purpose", async () => {
    fakeDb.reset({ otp_verifications: [] });
    const result = await verifyOtp({ phone: "+2348012340001", purpose: "reset", code: REAL_CODE });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});
