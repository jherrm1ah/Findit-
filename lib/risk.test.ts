import { describe, it, expect } from "vitest";
import { computeSellerRiskSignals, MIN_ORDERS_FOR_DISPUTE_RATE } from "./risk";

// NOTE ON SCOPE: same as lib/subscriptions.test.ts — getSellerRiskSignals
// itself needs a real Supabase project and isn't covered here. What's
// tested is the pure ranking/filtering logic it builds on.

function order(seller: string, escrowStatus: string, sellerId: string | null = null) {
  return { seller, sellerId, escrowStatus };
}

describe("computeSellerRiskSignals", () => {
  it("excludes a seller with zero disputes entirely, however many orders they have", () => {
    const orders = [order("Clean Co", "released"), order("Clean Co", "released"), order("Clean Co", "released")];
    expect(computeSellerRiskSignals(orders)).toEqual([]);
  });

  it(`excludes a seller below the ${MIN_ORDERS_FOR_DISPUTE_RATE}-order minimum even with a dispute — one dispute out of one order isn't a real "100% rate"`, () => {
    const orders = [order("New Seller", "disputed")];
    expect(computeSellerRiskSignals(orders)).toEqual([]);
  });

  it("includes a seller once they clear the minimum with at least one real dispute", () => {
    const orders = [order("Risky Co", "released"), order("Risky Co", "released"), order("Risky Co", "disputed")];
    const signals = computeSellerRiskSignals(orders);
    expect(signals).toEqual([
      { sellerName: "Risky Co", sellerId: null, totalOrders: 3, disputedOrders: 1, disputeRate: 1 / 3 },
    ]);
  });

  it("ranks the worst dispute rate first", () => {
    const orders = [
      ...Array(10).fill(null).map((_, i) => order("Mostly Fine", i === 0 ? "disputed" : "released")),
      ...Array(4).fill(null).map((_, i) => order("Frequently Disputed", i < 2 ? "disputed" : "released")),
    ];
    const signals = computeSellerRiskSignals(orders);
    expect(signals.map((s) => s.sellerName)).toEqual(["Frequently Disputed", "Mostly Fine"]);
  });

  it("carries the seller's real seller_id through when any of their order rows has one", () => {
    const orders = [order("Co", "released", null), order("Co", "disputed", "seller_123"), order("Co", "disputed", null)];
    const signals = computeSellerRiskSignals(orders);
    expect(signals[0].sellerId).toBe("seller_123");
  });

  it("THE BUG: never merges two different real sellers that happen to share a business name", () => {
    // business_name has no uniqueness constraint — "seller_a" is genuinely
    // risky, "seller_b" is genuinely clean, and they just happen to be
    // named the same thing. Before this fix, grouping by name alone would
    // merge them into one misleading signal.
    const orders = [
      order("Kemi's Kitchen", "disputed", "seller_a"),
      order("Kemi's Kitchen", "disputed", "seller_a"),
      order("Kemi's Kitchen", "released", "seller_a"),
      order("Kemi's Kitchen", "released", "seller_b"),
      order("Kemi's Kitchen", "released", "seller_b"),
      order("Kemi's Kitchen", "released", "seller_b"),
    ];
    const signals = computeSellerRiskSignals(orders);
    expect(signals).toEqual([
      { sellerName: "Kemi's Kitchen", sellerId: "seller_a", totalOrders: 3, disputedOrders: 2, disputeRate: 2 / 3 },
    ]);
    // seller_b never shows up at all — clean record, correctly excluded —
    // and critically its 3 clean orders never dilute seller_a's real rate.
    expect(signals.find((s) => s.sellerId === "seller_b")).toBeUndefined();
  });
});
