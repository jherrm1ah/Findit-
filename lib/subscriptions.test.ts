import { describe, it, expect } from "vitest";
import { selectProductsToDeactivate, formatUsageLabel } from "./subscriptions";

// NOTE ON SCOPE: same as lib/repo.test.ts — the DB-touching functions in
// lib/subscriptions.ts (getSellerSubscription, changeStorePlan, etc.) need a
// real Supabase project to exercise and aren't covered here. What's tested
// is the pure logic those functions build on: which listings a downgrade
// deactivates, and how usage is displayed.

describe("selectProductsToDeactivate", () => {
  const products = [
    { id: "p1", createdAt: "2026-01-01T00:00:00Z" },
    { id: "p2", createdAt: "2026-01-02T00:00:00Z" },
    { id: "p3", createdAt: "2026-01-03T00:00:00Z" },
  ];

  it("deactivates nothing when a plan is unlimited", () => {
    expect(selectProductsToDeactivate(products, null)).toEqual([]);
  });

  it("deactivates nothing when the seller is already within the new limit", () => {
    expect(selectProductsToDeactivate(products, 5)).toEqual([]);
    expect(selectProductsToDeactivate(products, 3)).toEqual([]);
  });

  it("keeps the OLDEST listings active and deactivates the newest ones over the limit", () => {
    // Business (150 products) -> Basic (50): the spec's own worked example —
    // never delete, and the seller's longest-standing catalogue survives.
    expect(selectProductsToDeactivate(products, 2)).toEqual(["p3"]);
    expect(selectProductsToDeactivate(products, 1)).toEqual(["p2", "p3"]);
    expect(selectProductsToDeactivate(products, 0)).toEqual(["p1", "p2", "p3"]);
  });

  it("doesn't care about input order — it sorts by createdAt itself", () => {
    const shuffled = [products[2], products[0], products[1]];
    expect(selectProductsToDeactivate(shuffled, 2)).toEqual(["p3"]);
  });
});

describe("formatUsageLabel", () => {
  it("matches the spec's exact display strings for a limited plan", () => {
    expect(formatUsageLabel(10, 10)).toBe("10 / 10 products used");
    expect(formatUsageLabel(34, 50)).toBe("34 / 50 products used");
    expect(formatUsageLabel(128, 200)).toBe("128 / 200 products used");
  });

  it("drops the denominator entirely for an unlimited plan", () => {
    expect(formatUsageLabel(128, null)).toBe("128 products");
  });

  it("singularizes a single product on an unlimited plan", () => {
    expect(formatUsageLabel(1, null)).toBe("1 product");
  });
});
