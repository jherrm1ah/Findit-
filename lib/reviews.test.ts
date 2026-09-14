import { describe, it, expect } from "vitest";
import { sellerOwnsReview } from "./reviews";

describe("sellerOwnsReview", () => {
  it("matches a review with a real seller_id only to that same id", () => {
    const review = { sellerId: "seller_1", sellerName: "Terra Gadgets" };
    expect(sellerOwnsReview(review, { sellerId: "seller_1", sellerName: "Terra Gadgets" })).toBe(true);
    expect(sellerOwnsReview(review, { sellerId: "seller_2", sellerName: "Terra Gadgets" })).toBe(false);
  });

  it("never lets a same-named seller claim a review that has a real seller_id", () => {
    // The whole point of seller_id existing: a name collision must never
    // let a different account claim someone else's review.
    const review = { sellerId: "seller_1", sellerName: "Shopera" };
    const impostor = { sellerId: "seller_2", sellerName: "Shopera" };
    expect(sellerOwnsReview(review, impostor)).toBe(false);
  });

  it("falls back to the business name only for a review with no seller_id (pre-backfill)", () => {
    const review = { sellerId: null, sellerName: "Kemi's Kitchen" };
    expect(sellerOwnsReview(review, { sellerId: "seller_1", sellerName: "Kemi's Kitchen" })).toBe(true);
    expect(sellerOwnsReview(review, { sellerId: "seller_1", sellerName: "Someone Else" })).toBe(false);
  });
});
