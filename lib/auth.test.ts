import { describe, it, expect } from "vitest";
import { hashPassword, normalizePhone } from "./auth";

// NOTE ON SCOPE: createUser/verifyLogin/createSession now read and write a
// real Supabase Postgres database (see lib/db.ts), which this sandbox has no
// network access to. What's tested here is the real logic that doesn't need
// a database: password hashing and phone normalization. The full signup/
// login flow needs to be verified by running the app against a real
// Supabase project (see README.md).

describe("normalizePhone", () => {
  it("normalizes Nigerian local format to E.164", () => {
    expect(normalizePhone("0801 234 5678")).toBe("+2348012345678");
  });

  it("collapses every common format for the same number to one value", () => {
    // This is the actual bug the E.164 rewrite fixes: these three used to
    // normalize to three different strings, meaning the same real phone
    // number could register three different accounts, or an OTP sent for
    // one format would never match a login attempt typed in another.
    const local = normalizePhone("08012345678");
    const withCountryCode = normalizePhone("2348012345678");
    const e164 = normalizePhone("+2348012345678");
    expect(local).toBe("+2348012345678");
    expect(withCountryCode).toBe("+2348012345678");
    expect(e164).toBe("+2348012345678");
  });

  it("passes through an already-E.164 number from another country untouched", () => {
    expect(normalizePhone("+14155552671")).toBe("+14155552671");
  });
});

describe("hashPassword", () => {
  it("is deterministic for the same password and salt", () => {
    const salt = "fixed-salt";
    expect(hashPassword("correcthorse", salt)).toBe(hashPassword("correcthorse", salt));
  });

  it("produces a different hash for a different password", () => {
    const salt = "fixed-salt";
    expect(hashPassword("correcthorse", salt)).not.toBe(hashPassword("wrongpassword", salt));
  });

  it("produces a different hash for the same password with a different salt", () => {
    expect(hashPassword("correcthorse", "salt-a")).not.toBe(hashPassword("correcthorse", "salt-b"));
  });
});
