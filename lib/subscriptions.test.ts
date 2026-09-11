import { describe, it, expect } from "vitest";
import { selectProductsToDeactivate, formatUsageLabel, isSubscriptionLapsed } from "./subscriptions";

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

// This is the one check standing between "still Pro" and "quietly still
// showing Pro after it lapsed" — the exact trust failure ("I paid for Pro
// but I'm still seeing the Free version," or its inverse: seeing Pro
// benefits after the seller stopped paying) a subscription system can't
// afford in either direction.
describe("isSubscriptionLapsed", () => {
  const NOW = new Date("2026-06-15T12:00:00Z").getTime();

  it("is not lapsed while a trial is still running", () => {
    const sub = { status: "trialing" as const, trialEndsAt: "2026-06-20T00:00:00Z", currentPeriodEnd: null };
    expect(isSubscriptionLapsed(sub, 5000, NOW)).toBe(false);
  });

  it("is lapsed the instant a trial's end date passes", () => {
    const sub = { status: "trialing" as const, trialEndsAt: "2026-06-15T00:00:00Z", currentPeriodEnd: null };
    expect(isSubscriptionLapsed(sub, 5000, NOW)).toBe(true);
  });

  it("is not lapsed while an active paid period is still current", () => {
    const sub = { status: "active" as const, trialEndsAt: null, currentPeriodEnd: "2026-07-01T00:00:00Z" };
    expect(isSubscriptionLapsed(sub, 5000, NOW)).toBe(false);
  });

  it("is lapsed once a paid period's end date passes with no renewal", () => {
    const sub = { status: "active" as const, trialEndsAt: null, currentPeriodEnd: "2026-06-01T00:00:00Z" };
    expect(isSubscriptionLapsed(sub, 5000, NOW)).toBe(true);
  });

  it("past_due (a failed renewal charge) still lapses once the period end passes", () => {
    const sub = { status: "past_due" as const, trialEndsAt: null, currentPeriodEnd: "2026-06-01T00:00:00Z" };
    expect(isSubscriptionLapsed(sub, 5000, NOW)).toBe(true);
  });

  it("Free never lapses — a null period end with price 0 is the normal, permanent state", () => {
    const sub = { status: "active" as const, trialEndsAt: null, currentPeriodEnd: null };
    expect(isSubscriptionLapsed(sub, 0, NOW)).toBe(false);
  });

  it("a plan with a past currentPeriodEnd but price 0 never lapses (defends the Free-plan invariant even with bad data)", () => {
    const sub = { status: "active" as const, trialEndsAt: null, currentPeriodEnd: "2026-01-01T00:00:00Z" };
    expect(isSubscriptionLapsed(sub, 0, NOW)).toBe(false);
  });

  it("cancelled and expired are already-resolved terminal states, not checked here", () => {
    expect(isSubscriptionLapsed({ status: "cancelled" as const, trialEndsAt: null, currentPeriodEnd: "2026-01-01T00:00:00Z" }, 5000, NOW)).toBe(false);
    expect(isSubscriptionLapsed({ status: "expired" as const, trialEndsAt: null, currentPeriodEnd: "2026-01-01T00:00:00Z" }, 5000, NOW)).toBe(false);
  });
});
