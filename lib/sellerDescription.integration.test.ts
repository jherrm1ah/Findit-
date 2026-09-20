import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";

// updateSellerDescription is the fix for a real bug: submitVerification
// (the ONLY other writer of sellers.description) also resets
// verification_status to 'pending' on every save — right for the fields
// that actually describe the business, wrong for a seller who just wants
// to fix a typo in their bio, since it costs them their Verified/Trusted
// badge until an admin re-reviews. This exercises the real function against
// the fake Supabase client and checks the one thing that matters: the bio
// changes and nothing about verification does.

const fakeDb: FakeSupabase = createFakeSupabase();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeDb,
}));

process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const { updateSellerDescription } = await import("./repo");
const { ValidationError } = await import("./errors");

function seller(overrides: Record<string, unknown> = {}) {
  return {
    id: "seller_1",
    user_id: "user_1",
    name: "Terra Gadgets",
    description: "Old bio.",
    verification_status: "approved",
    ...overrides,
  };
}

beforeEach(() => {
  fakeDb.reset({ sellers: [seller()] });
});

describe("updateSellerDescription", () => {
  it("updates the bio without touching verification_status", async () => {
    await updateSellerDescription("seller_1", "New bio, fixed the typo.");
    const row = fakeDb.dump("sellers")[0];
    expect(row.description).toBe("New bio, fixed the typo.");
    expect(row.verification_status).toBe("approved");
  });

  it("trims whitespace and stores null for an empty bio", async () => {
    await updateSellerDescription("seller_1", "   ");
    expect(fakeDb.dump("sellers")[0].description).toBeNull();
  });

  it("rejects a bio over the length cap, before writing anything", async () => {
    await expect(updateSellerDescription("seller_1", "x".repeat(2001))).rejects.toThrow(ValidationError);
    expect(fakeDb.dump("sellers")[0].description).toBe("Old bio.");
  });
});
