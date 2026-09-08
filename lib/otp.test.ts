import { describe, it, expect, afterEach } from "vitest";
import { generateOtpCode, hashOtpCode, getOtpConfig } from "./otp";

// NOTE ON SCOPE: createOtp/verifyOtp/isRecentlyVerified/clearOtp all read
// and write the real Supabase Postgres otp_verifications table, which this
// sandbox has no network access to (same limitation documented across the
// rest of lib/**/*.test.ts). What's covered here is the real logic that
// doesn't need a database: code generation, hashing, and env-driven config
// — the pieces a bug in would be silent and hard to catch by hand. The
// database-touching paths (the full send -> verify -> attempts/expiry/
// resend-cooldown/hourly-cap flow) need to be verified against a real
// Supabase project, same as signup/login/orders elsewhere in this app.

describe("generateOtpCode", () => {
  it("always produces a 6-digit numeric string, zero-padded", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it("is not the same value every time (sanity check it's actually random)", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateOtpCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("hashOtpCode", () => {
  it("is deterministic for the same code and salt", () => {
    expect(hashOtpCode("492013", "fixed-salt")).toBe(hashOtpCode("492013", "fixed-salt"));
  });

  it("produces a different hash for a different code", () => {
    expect(hashOtpCode("492013", "fixed-salt")).not.toBe(hashOtpCode("111111", "fixed-salt"));
  });

  it("produces a different hash for the same code with a different salt", () => {
    expect(hashOtpCode("492013", "salt-a")).not.toBe(hashOtpCode("492013", "salt-b"));
  });

  it("never contains the plaintext code as a substring (sanity check it's actually hashed)", () => {
    const hash = hashOtpCode("492013", "some-salt");
    expect(hash).not.toContain("492013");
  });
});

describe("getOtpConfig", () => {
  const envKeys = [
    "OTP_EXPIRY_MINUTES",
    "OTP_RESEND_COOLDOWN_SECONDS",
    "OTP_MAX_ATTEMPTS",
    "OTP_MAX_REQUESTS_PER_HOUR",
    "OTP_MAX_RESENDS",
  ];

  afterEach(() => {
    for (const key of envKeys) delete process.env[key];
  });

  it("falls back to spec-documented defaults when nothing is configured", () => {
    for (const key of envKeys) delete process.env[key];
    const config = getOtpConfig();
    expect(config).toEqual({
      expiryMinutes: 10,
      resendCooldownSeconds: 60,
      maxAttempts: 5,
      maxRequestsPerHour: 5,
      maxResends: 3,
    });
  });

  it("reads real values from the environment when set", () => {
    process.env.OTP_EXPIRY_MINUTES = "15";
    process.env.OTP_MAX_ATTEMPTS = "7";
    const config = getOtpConfig();
    expect(config.expiryMinutes).toBe(15);
    expect(config.maxAttempts).toBe(7);
  });

  it("ignores a garbage env value and falls back to the default instead of crashing", () => {
    process.env.OTP_MAX_RESENDS = "not-a-number";
    expect(getOtpConfig().maxResends).toBe(3);
  });
});
