import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";

// Exercises the REAL findUserForSellerId/findUserByBusinessName/
// getOrCreateConversation against the fake Supabase client. Covers the bug
// this closes: business_name has no uniqueness constraint (same fact
// lib/sellerIdentityMatch.ts is built around), so two sellers can share a
// name — findUserByBusinessName's .maybeSingle() then throws instead of
// picking one, breaking "message seller" for BOTH of them. sellerId is the
// unambiguous path every caller with an id available should use instead.

const fakeDb: FakeSupabase = createFakeSupabase();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeDb,
}));

process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const { findUserForSellerId, findUserByBusinessName, getOrCreateConversation } = await import("./repo");

function seller(overrides: Record<string, unknown> = {}) {
  return { id: "seller_1", user_id: "user_seller_1", name: "Terra Gadgets", ...overrides };
}

function user(overrides: Record<string, unknown> = {}) {
  return { id: "user_seller_1", role: "seller", business_name: "Terra Gadgets", name: "Terra Gadgets", phone: "+2348000000001", ...overrides };
}

beforeEach(() => {
  fakeDb.reset({ sellers: [seller()], users: [user()], conversations: [] });
});

describe("findUserForSellerId — the unambiguous path", () => {
  it("resolves a seller's real id to their user account", async () => {
    const result = await findUserForSellerId("seller_1");
    expect(result?.id).toBe("user_seller_1");
  });

  it("still resolves correctly even when two sellers share a business name", async () => {
    fakeDb.reset({
      sellers: [seller({ id: "seller_1", user_id: "user_a" }), seller({ id: "seller_2", user_id: "user_b" })],
      users: [
        user({ id: "user_a", business_name: "Terra Gadgets" }),
        user({ id: "user_b", business_name: "Terra Gadgets" }),
      ],
    });
    expect((await findUserForSellerId("seller_1"))?.id).toBe("user_a");
    expect((await findUserForSellerId("seller_2"))?.id).toBe("user_b");
  });

  it("returns null for a seller id that doesn't exist", async () => {
    expect(await findUserForSellerId("nope")).toBeNull();
  });
});

describe("findUserByBusinessName — the bug this closes", () => {
  it("resolves a unique business name fine", async () => {
    expect((await findUserByBusinessName("Terra Gadgets"))?.id).toBe("user_seller_1");
  });

  it("throws when two sellers share a business name, instead of picking one", async () => {
    fakeDb.reset({
      sellers: [seller({ id: "seller_1", user_id: "user_a" }), seller({ id: "seller_2", user_id: "user_b" })],
      users: [
        user({ id: "user_a", business_name: "Terra Gadgets" }),
        user({ id: "user_b", business_name: "Terra Gadgets" }),
      ],
    });
    await expect(findUserByBusinessName("Terra Gadgets")).rejects.toThrow();
  });
});

describe("getOrCreateConversation — reaches the right seller via sellerId", () => {
  it("starts a real conversation with the seller resolved via id, not name", async () => {
    fakeDb.reset({
      sellers: [seller({ id: "seller_1", user_id: "user_a" }), seller({ id: "seller_2", user_id: "user_b" })],
      users: [
        user({ id: "user_a", business_name: "Terra Gadgets" }),
        user({ id: "user_b", business_name: "Terra Gadgets" }),
      ],
      conversations: [],
    });
    const seller2 = await findUserForSellerId("seller_2");
    const conversationId = await getOrCreateConversation("buyer_1", seller2!.id);
    const [row] = fakeDb.dump("conversations");
    expect(row.id).toBe(conversationId);
    expect(row.seller_id).toBe("user_b");
  });
});
