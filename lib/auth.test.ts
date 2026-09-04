import { describe, it, expect } from "vitest";
import { hashPassword, normalizePhone } from "./auth";

// NOTE ON SCOPE: createUser/verifyLogin/createSession now read and write a
// real Supabase Postgres database (see lib/db.ts), which this sandbox has no
// network access to. What's tested here is the real logic that doesn't need
// a database: password hashing and phone normalization. The full signup/
// login flow needs to be verified by running the app against a real
// Supabase project (see README.md).

describe("normalizePhone", () => {
  it("strips spaces and punctuation but keeps a leading +", () => {
    expect(normalizePhone("080 123 4567")).toBe("0801234567");
    expect(normalizePhone("+234 803 000 0000")).toBe("+2348030000000");
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
