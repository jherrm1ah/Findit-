import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";

// Exercises the REAL lib/reviews.ts functions against the fake Supabase
// client, not a reimplementation of them. lib/reviews.test.ts already
// covers the pure ownership check (sellerOwnsReview); this covers the
// database wiring around it, plus lib/repo.ts#submitOrderReview's new
// one-review-per-order guard, which is what this table's whole existence
// depends on staying true.

const fakeDb: FakeSupabase = createFakeSupabase();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeDb,
}));

process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const { recordReview, replyToReview, listPublicReviewsForSeller, listOwnReviews } = await import("./reviews");
const { submitOrderReview, getOrder } = await import("./repo");

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "ORD-1",
    user_id: "buyer_1",
    item: "Blender",
    seller: "Terra Gadgets",
    seller_id: "seller_1",
    price: 15000,
    status: "Delivered",
    can_review: true,
    reviewed: false,
    escrow_status: "released",
    payment_status: "paid",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  fakeDb.reset();
});

describe("submitOrderReview — one review per order", () => {
  it("records a review the first time", async () => {
    fakeDb.reset({ orders: [order()], users: [], notifications: [] });

    const result = await submitOrderReview("ORD-1", "buyer_1", { rating: 5, comment: "Great!" });

    expect(result?.reviewed).toBe(true);
    expect(fakeDb.dump("reviews")).toHaveLength(1);
    expect(fakeDb.dump("reviews")[0].rating).toBe(5);
    expect(fakeDb.dump("reviews")[0].comment).toBe("Great!");
  });

  it("refuses a second review on the same order rather than silently overwriting it", async () => {
    fakeDb.reset({ orders: [order()], users: [], notifications: [] });

    await submitOrderReview("ORD-1", "buyer_1", { rating: 5, comment: "Great!" });
    await expect(submitOrderReview("ORD-1", "buyer_1", { rating: 1, comment: "Changed my mind" })).rejects.toThrow(
      /already reviewed/i
    );

    // The original review stands — nothing was overwritten.
    const [row] = fakeDb.dump("orders");
    expect(row.my_rating).toBe(5);
    expect(fakeDb.dump("reviews")).toHaveLength(1);
  });

  // No length cap existed at all before this — a review comment (unlike
  // every other user-generated text field checked this session — chat
  // messages, support tickets, broadcasts) had nothing stopping it. Checked
  // before the order is even loaded, so it never reaches either copy
  // (orders.review_comment AND the reviews table recordReview writes).
  it("refuses a review comment over the length cap, before writing anything", async () => {
    fakeDb.reset({ orders: [order()], users: [], notifications: [] });

    await expect(
      submitOrderReview("ORD-1", "buyer_1", { rating: 5, comment: "x".repeat(1001) })
    ).rejects.toThrow(/under 1000/i);

    expect((await getOrder("ORD-1"))?.reviewed).toBe(false);
    expect(fakeDb.dump("reviews")).toHaveLength(0);
  });
});

describe("recordReview", () => {
  it("never throws even if called twice for the same order", async () => {
    fakeDb.reset({ orders: [order()] });
    const theOrder = await getOrder("ORD-1");

    await recordReview(theOrder!, "buyer_1", { rating: 4, comment: "Good" });
    await expect(recordReview(theOrder!, "buyer_1", { rating: 4, comment: "Good" })).resolves.toBeUndefined();

    expect(fakeDb.dump("reviews")).toHaveLength(1);
  });
});

describe("replyToReview", () => {
  function seedReview(overrides: Record<string, unknown> = {}) {
    fakeDb.reset({
      reviews: [
        {
          id: "rvw_1",
          order_id: "ORD-1",
          buyer_user_id: "buyer_1",
          seller_id: "seller_1",
          seller_name: "Terra Gadgets",
          rating: 5,
          comment: "Great!",
          seller_reply: null,
          seller_replied_at: null,
          created_at: new Date().toISOString(),
          ...overrides,
        },
      ],
    });
  }

  it("lets the owning seller reply", async () => {
    seedReview();

    const review = await replyToReview("rvw_1", { sellerId: "seller_1", sellerName: "Terra Gadgets" }, "Thanks so much!");

    expect(review?.sellerReply).toBe("Thanks so much!");
    expect(review?.sellerRepliedAt).not.toBeNull();
  });

  it("refuses a different seller_id, even with the same business name", async () => {
    seedReview();

    const review = await replyToReview("rvw_1", { sellerId: "seller_2", sellerName: "Terra Gadgets" }, "Not yours!");

    expect(review).toBeNull();
    expect(fakeDb.dump("reviews")[0].seller_reply).toBeNull();
  });

  it("falls back to the business name for a legacy review with no seller_id", async () => {
    seedReview({ seller_id: null });

    const review = await replyToReview("rvw_1", { sellerId: "seller_1", sellerName: "Terra Gadgets" }, "Thanks!");

    expect(review?.sellerReply).toBe("Thanks!");
  });

  it("rejects a reply that's too short", async () => {
    seedReview();
    await expect(replyToReview("rvw_1", { sellerId: "seller_1", sellerName: "Terra Gadgets" }, "x")).rejects.toThrow();
  });
});

describe("listPublicReviewsForSeller", () => {
  it("only returns this seller's reviews, newest first", async () => {
    fakeDb.reset({
      reviews: [
        { id: "r1", order_id: "o1", buyer_user_id: "b1", seller_id: "seller_1", seller_name: "Terra", rating: 4, comment: "ok", created_at: "2026-01-01T00:00:00.000Z" },
        { id: "r2", order_id: "o2", buyer_user_id: "b2", seller_id: "seller_1", seller_name: "Terra", rating: 5, comment: "great", created_at: "2026-02-01T00:00:00.000Z" },
        { id: "r3", order_id: "o3", buyer_user_id: "b3", seller_id: "seller_2", seller_name: "Other", rating: 1, comment: "bad", created_at: "2026-01-15T00:00:00.000Z" },
      ],
    });

    const reviews = await listPublicReviewsForSeller("seller_1");

    expect(reviews.map((r) => r.id)).toEqual(["r2", "r1"]);
  });

  it("does not surface a review with no seller_id, even if the name matches", async () => {
    fakeDb.reset({
      reviews: [{ id: "r1", order_id: "o1", buyer_user_id: "b1", seller_id: null, seller_name: "Terra", rating: 4, comment: "ok", created_at: new Date().toISOString() }],
    });

    expect(await listPublicReviewsForSeller("seller_1")).toEqual([]);
  });
});

describe("listOwnReviews", () => {
  it("finds a seller's reviews by id and by legacy name fallback, deduped", async () => {
    fakeDb.reset({
      reviews: [
        { id: "r1", order_id: "o1", buyer_user_id: "b1", seller_id: "seller_1", seller_name: "Terra", rating: 4, comment: "ok", created_at: "2026-01-01T00:00:00.000Z" },
        { id: "r2", order_id: "o2", buyer_user_id: "b2", seller_id: null, seller_name: "Terra", rating: 5, comment: "great", created_at: "2026-02-01T00:00:00.000Z" },
        { id: "r3", order_id: "o3", buyer_user_id: "b3", seller_id: "seller_2", seller_name: "Terra", rating: 1, comment: "not this one", created_at: new Date().toISOString() },
      ],
    });

    const reviews = await listOwnReviews({ sellerId: "seller_1", sellerName: "Terra" });

    expect(reviews.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
    expect(reviews[0].id).toBe("r2"); // newest first
  });
});
