import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";

// Exercises the REAL activateBoost against the fake Supabase client.
// Covers the fix for a real "charged, never boosted" gap: activateBoost is
// additive (extends products.boosted_until, inserts another boosts row),
// so calling it twice for the same Paystack payment — which the webhook now
// does on a redelivered charge.success, see app/api/payments/paystack/webhook —
// must not double-apply. payment_id (migration 029) is what makes the
// second call a no-op instead of a double boost.

const fakeDb: FakeSupabase = createFakeSupabase();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeDb,
}));

process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const { activateBoost } = await import("./boosts");

function seedProductAndPlan(overrides: Record<string, unknown> = {}) {
  fakeDb.reset({
    boost_plans: [{ id: "boost_7d", name: "7-day Boost", duration_days: 7, price: 2000, sort_order: 1, active: true }],
    products: [{ id: "product_1", name: "USB-C cable", seller: "Terra Gadgets", seller_id: "seller_1", boosted_until: null, ...overrides }],
  });
}

beforeEach(() => {
  seedProductAndPlan();
});

describe("activateBoost — idempotent on payment_id", () => {
  it("applies the boost once for a new payment", async () => {
    await activateBoost({ productId: "product_1", sellerId: "seller_1", boostPlanId: "boost_7d", amount: 2000, paymentId: "pay_1" });

    const boosts = fakeDb.dump("boosts");
    expect(boosts).toHaveLength(1);
    expect(boosts[0].payment_id).toBe("pay_1");

    const product = fakeDb.dump("products").find((p) => p.id === "product_1")!;
    expect(product.boosted_until).not.toBeNull();
  });

  it("is a no-op on a second call for the same payment (a redelivered webhook)", async () => {
    await activateBoost({ productId: "product_1", sellerId: "seller_1", boostPlanId: "boost_7d", amount: 2000, paymentId: "pay_1" });
    const boostedUntilAfterFirst = fakeDb.dump("products").find((p) => p.id === "product_1")!.boosted_until;

    await activateBoost({ productId: "product_1", sellerId: "seller_1", boostPlanId: "boost_7d", amount: 2000, paymentId: "pay_1" });

    expect(fakeDb.dump("boosts")).toHaveLength(1); // not two
    const boostedUntilAfterSecond = fakeDb.dump("products").find((p) => p.id === "product_1")!.boosted_until;
    expect(boostedUntilAfterSecond).toBe(boostedUntilAfterFirst); // not extended twice
  });

  it("still applies a genuinely different payment (buying a second boost) on top of the first", async () => {
    await activateBoost({ productId: "product_1", sellerId: "seller_1", boostPlanId: "boost_7d", amount: 2000, paymentId: "pay_1" });

    await activateBoost({ productId: "product_1", sellerId: "seller_1", boostPlanId: "boost_7d", amount: 2000, paymentId: "pay_2" });

    expect(fakeDb.dump("boosts")).toHaveLength(2);
  });
});
