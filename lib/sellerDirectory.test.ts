import { describe, it, expect } from "vitest";
import { buildPublicSellerDirectory, type PublicSellerSummary } from "./sellerDirectory";

function seller(overrides: Partial<Parameters<typeof buildPublicSellerDirectory>[0][number]> = {}) {
  return {
    id: "seller_1",
    name: "Terra Gadgets",
    logoUrl: null,
    bannerUrl: null,
    sellerType: "online_business",
    category: "electronics",
    location: "Lagos",
    memberSince: "2025-01-01T00:00:00.000Z",
    verificationStatus: "approved" as const,
    storeSlug: "terra",
    ...overrides,
  };
}

const noReviews: Array<{ sellerId: string | null; myRating: number | null }> = [];
const noOutcomes: Array<{ sellerId: string | null; escrowStatus: string }> = [];
const noListings = new Map<string, number>();
const noPlans = new Map<string, { proBadge: boolean; planId: string }>();

describe("buildPublicSellerDirectory", () => {
  it("returns a summary for each seller with sensible defaults", () => {
    const [result] = buildPublicSellerDirectory([seller()], noReviews, noOutcomes, noListings, noPlans);
    expect(result.id).toBe("seller_1");
    expect(result.rating).toBeNull();
    expect(result.reviewCount).toBe(0);
    expect(result.completedOrderCount).toBe(0);
    expect(result.activeListingCount).toBe(0);
    expect(result.proBadge).toBe(false);
    expect(result.verificationLevel).toBe("verified"); // approved, no track record yet
  });

  it("rolls up a rating from that seller's reviewed orders only", () => {
    const [result] = buildPublicSellerDirectory(
      [seller(), seller({ id: "seller_2", name: "Other Shop" })],
      [
        { sellerId: "seller_1", myRating: 5 },
        { sellerId: "seller_1", myRating: 3 },
        { sellerId: "seller_2", myRating: 1 },
      ],
      noOutcomes,
      noListings,
      noPlans
    );
    expect(result.rating).toBe(4); // (5+3)/2
    expect(result.reviewCount).toBe(2);
  });

  it("ignores a review row with no seller_id rather than guessing whose it is", () => {
    const [result] = buildPublicSellerDirectory(
      [seller()],
      [{ sellerId: null, myRating: 5 }],
      noOutcomes,
      noListings,
      noPlans
    );
    expect(result.rating).toBeNull();
    expect(result.reviewCount).toBe(0);
  });

  it("counts completed and disputed orders separately by seller_id", () => {
    const [result] = buildPublicSellerDirectory(
      [seller()],
      noReviews,
      [
        { sellerId: "seller_1", escrowStatus: "released" },
        { sellerId: "seller_1", escrowStatus: "released" },
        { sellerId: "seller_1", escrowStatus: "disputed" },
        { sellerId: "seller_2", escrowStatus: "released" }, // a different seller, must not leak in
      ],
      noListings,
      noPlans
    );
    expect(result.completedOrderCount).toBe(2);
  });

  it("computes 'trusted' only once the real thresholds are met", () => {
    const outcomes = Array.from({ length: 10 }, () => ({ sellerId: "seller_1", escrowStatus: "released" }));
    const reviews = [{ sellerId: "seller_1", myRating: 5 }];
    const [result] = buildPublicSellerDirectory([seller()], reviews, outcomes, noListings, noPlans);
    expect(result.verificationLevel).toBe("trusted");
  });

  it("never claims verified or trusted for a seller who isn't approved", () => {
    const [result] = buildPublicSellerDirectory(
      [seller({ verificationStatus: "pending" })],
      noReviews,
      noOutcomes,
      noListings,
      noPlans
    );
    expect(result.verificationLevel).toBe("new");
  });

  it("reads the active listing count for the matching seller_id", () => {
    const counts = new Map([["seller_1", 3]]);
    const [result] = buildPublicSellerDirectory([seller()], noReviews, noOutcomes, counts, noPlans);
    expect(result.activeListingCount).toBe(3);
  });

  it("only exposes the store slug when the current plan actually publishes it", () => {
    const plans = new Map([["seller_1", { proBadge: true, planId: "store_business" }]]);
    const [result] = buildPublicSellerDirectory([seller()], noReviews, noOutcomes, noListings, plans);
    expect(result.storeSlug).toBe("terra");
    expect(result.proBadge).toBe(true);
  });

  it("hides the store slug when the seller is on the free plan, even though the slug is reserved", () => {
    const plans = new Map([["seller_1", { proBadge: false, planId: "store_free" }]]);
    const [result] = buildPublicSellerDirectory([seller()], noReviews, noOutcomes, noListings, plans);
    expect(result.storeSlug).toBeNull();
  });

  it("puts Pro sellers first, stably preserving the caller's order within each group", () => {
    const sellers = [
      seller({ id: "a", name: "A" }),
      seller({ id: "b", name: "B" }),
      seller({ id: "c", name: "C" }),
    ];
    const plans = new Map([["b", { proBadge: true, planId: "store_business" }]]);
    const result = buildPublicSellerDirectory(sellers, noReviews, noOutcomes, noListings, plans);
    expect(result.map((r: PublicSellerSummary) => r.id)).toEqual(["b", "a", "c"]);
  });
});
