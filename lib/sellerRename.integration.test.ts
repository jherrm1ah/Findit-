import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";

// Exercises the REAL updateSellerBusinessName against the fake Supabase
// client. Covers the bug this closes: business_name has no uniqueness
// constraint, so the old rename cascade (`where seller = oldName`, no
// seller_id scoping) would ALSO rename a completely different seller's
// products/orders/offers if they happened to share this seller's old
// name — silently reattributing rows that were never this account's.

const fakeDb: FakeSupabase = createFakeSupabase();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeDb,
}));

process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const { updateSellerBusinessName } = await import("./auth");

function seedTwoSellersSameName() {
  fakeDb.reset({
    users: [
      { id: "user_a", role: "seller", business_name: "Quick Mart", name: "Amaka" },
      { id: "user_b", role: "seller", business_name: "Quick Mart", name: "Bola" },
    ],
    sellers: [
      { id: "seller_a", user_id: "user_a", name: "Quick Mart" },
      { id: "seller_b", user_id: "user_b", name: "Quick Mart" },
    ],
    products: [
      { id: "p_a", name: "Rice", seller: "Quick Mart", seller_id: "seller_a" },
      { id: "p_b", name: "Beans", seller: "Quick Mart", seller_id: "seller_b" },
      // Legacy row, predates the seller_id backfill.
      { id: "p_legacy", name: "Garri", seller: "Quick Mart", seller_id: null },
    ],
    orders: [
      { id: "o_a", user_id: "buyer_1", item: "Rice", seller: "Quick Mart", seller_id: "seller_a", price: 5000, status: "Delivered" },
      { id: "o_b", user_id: "buyer_1", item: "Beans", seller: "Quick Mart", seller_id: "seller_b", price: 3000, status: "Delivered" },
    ],
    offers: [
      { id: "off_a", request_id: "req_1", seller: "Quick Mart", seller_id: "seller_a", price: 5000, delivery: "2000", eta: "1 day", condition: "New", warranty: "none" },
      { id: "off_b", request_id: "req_1", seller: "Quick Mart", seller_id: "seller_b", price: 4000, delivery: "1500", eta: "2 days", condition: "New", warranty: "none" },
    ],
  });
}

beforeEach(() => {
  fakeDb.reset();
});

describe("updateSellerBusinessName — doesn't rename another seller's rows", () => {
  it("renames only the requesting seller's own products, orders, and offers", async () => {
    seedTwoSellersSameName();

    await updateSellerBusinessName("user_a", "Quick Mart Express");

    const products = fakeDb.dump("products");
    expect(products.find((p) => p.id === "p_a")!.seller).toBe("Quick Mart Express");
    expect(products.find((p) => p.id === "p_b")!.seller).toBe("Quick Mart"); // untouched

    const orders = fakeDb.dump("orders");
    expect(orders.find((o) => o.id === "o_a")!.seller).toBe("Quick Mart Express");
    expect(orders.find((o) => o.id === "o_b")!.seller).toBe("Quick Mart"); // untouched

    const offers = fakeDb.dump("offers");
    expect(offers.find((o) => o.id === "off_a")!.seller).toBe("Quick Mart Express");
    expect(offers.find((o) => o.id === "off_b")!.seller).toBe("Quick Mart"); // untouched

    // The renaming seller's own sellers row is updated too.
    expect(fakeDb.dump("sellers").find((s) => s.id === "seller_a")!.name).toBe("Quick Mart Express");
    expect(fakeDb.dump("sellers").find((s) => s.id === "seller_b")!.name).toBe("Quick Mart"); // untouched
  });

  it("still renames legacy rows with no seller_id that match the old name", async () => {
    seedTwoSellersSameName();

    await updateSellerBusinessName("user_a", "Quick Mart Express");

    const legacy = fakeDb.dump("products").find((p) => p.id === "p_legacy")!;
    expect(legacy.seller).toBe("Quick Mart Express");
  });

  it("does nothing to other rows when the seller has no products/orders/offers yet", async () => {
    fakeDb.reset({
      users: [{ id: "user_a", role: "seller", business_name: "Solo Seller", name: "Amaka" }],
      sellers: [{ id: "seller_a", user_id: "user_a", name: "Solo Seller" }],
    });

    const updated = await updateSellerBusinessName("user_a", "Solo Seller NG");
    expect(updated.businessName).toBe("Solo Seller NG");
    expect(fakeDb.dump("sellers")[0].name).toBe("Solo Seller NG");
  });
});
