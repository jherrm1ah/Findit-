import { describe, it, expect } from "vitest";
import {
  validateProductInput,
  validateOfferInput,
  validateStatusTransition,
  computeSellerStatsMap,
  isValidProductImageUrl,
  ORDER_STATUSES,
  ValidationError,
} from "./repo";

// NOTE ON SCOPE: lib/repo.ts now talks to a real Supabase Postgres database
// (see lib/db.ts) instead of a local SQLite file. This sandbox has no
// network access to Supabase, so the DB-touching functions (createProduct,
// createOrder, acceptOffer, the messaging functions, etc.) can't be
// exercised here — there is nothing to fake that would actually prove they
// work. What CAN be tested honestly, offline, is the real business logic
// those functions build on: input validation, the forward-only order status
// rule, and the seller-stats aggregation math. That's what this file covers.
// The DB-touching paths need to be verified by running the app against a
// real Supabase project (see README.md) — they are not covered by an
// automated test here.

describe("validateProductInput", () => {
  it("rejects an unknown category, empty name, and non-positive price", () => {
    expect(() => validateProductInput({ category: "not-a-real-category" })).toThrow();
    expect(() => validateProductInput({ name: "   " })).toThrow();
    expect(() => validateProductInput({ price: 0 })).toThrow();
    expect(() => validateProductInput({ price: -5 })).toThrow();
  });

  it("throws ValidationError specifically, so routes can tell a user-facing message apart from an internal error", () => {
    expect(() => validateProductInput({ price: -5 })).toThrow(ValidationError);
  });

  it("accepts a valid full input and a valid partial patch", () => {
    expect(() => validateProductInput({ category: "reading", name: "Reading light", price: 3000 })).not.toThrow();
    expect(() => validateProductInput({ price: 5000 })).not.toThrow();
    expect(() => validateProductInput({})).not.toThrow();
  });
});

describe("validateOfferInput", () => {
  it("rejects a non-positive price and missing delivery/eta/warranty", () => {
    expect(() =>
      validateOfferInput({ price: 0, delivery: "2000", eta: "1 day", warranty: "6 months" })
    ).toThrow();
    expect(() =>
      validateOfferInput({ price: 5000, delivery: "  ", eta: "1 day", warranty: "6 months" })
    ).toThrow();
    expect(() =>
      validateOfferInput({ price: 5000, delivery: "2000", eta: "", warranty: "6 months" })
    ).toThrow();
    expect(() =>
      validateOfferInput({ price: 5000, delivery: "2000", eta: "1 day", warranty: "" })
    ).toThrow();
  });

  it("accepts a fully filled-in offer", () => {
    expect(() =>
      validateOfferInput({ price: 5000, delivery: "2000", eta: "1–2 days", warranty: "6 months" })
    ).not.toThrow();
  });
});

describe("validateStatusTransition", () => {
  it("rejects an unknown status", () => {
    expect(() => validateStatusTransition("Awaiting payment", "Cancelled")).toThrow();
  });

  it("allows moving forward, including staying in place", () => {
    expect(() => validateStatusTransition("Awaiting payment", "Seller preparing")).not.toThrow();
    expect(() => validateStatusTransition("Awaiting payment", "Delivered")).not.toThrow();
    expect(() => validateStatusTransition("Dispatched", "Dispatched")).not.toThrow();
  });

  it("rejects moving backwards", () => {
    expect(() => validateStatusTransition("Dispatched", "Seller preparing")).toThrow();
    expect(() => validateStatusTransition("Delivered", "Awaiting payment")).toThrow();
  });

  it("covers the full real lifecycle in order", () => {
    for (let i = 1; i < ORDER_STATUSES.length; i++) {
      expect(() => validateStatusTransition(ORDER_STATUSES[i - 1], ORDER_STATUSES[i])).not.toThrow();
    }
  });
});

describe("computeSellerStatsMap", () => {
  it("marks a seller verified only when their account is approved", () => {
    const map = computeSellerStatsMap(
      [
        { name: "Approved Co", status: "approved" },
        { name: "Pending Co", status: "pending" },
        { name: "Rejected Co", status: "rejected" },
      ],
      []
    );
    expect(map.get("Approved Co")?.verified).toBe(true);
    expect(map.get("Pending Co")?.verified).toBe(false);
    expect(map.get("Rejected Co")?.verified).toBe(false);
  });

  it("averages a seller's reviewed-order ratings and counts them", () => {
    const map = computeSellerStatsMap(
      [{ name: "Terra Gadgets", status: "approved" }],
      [
        { seller: "Terra Gadgets", my_rating: 5 },
        { seller: "Terra Gadgets", my_rating: 3 },
        { seller: "Terra Gadgets", my_rating: null }, // unrated order, shouldn't count
      ]
    );
    const stats = map.get("Terra Gadgets");
    expect(stats?.rating).toBe(4);
    expect(stats?.orderCount).toBe(2);
  });

  it("gives a seller with no reviews yet a null rating instead of zero", () => {
    const map = computeSellerStatsMap([{ name: "New Seller", status: "approved" }], []);
    expect(map.get("New Seller")?.rating).toBeNull();
    expect(map.get("New Seller")?.orderCount).toBe(0);
  });

  it("still surfaces ratings for a seller with orders but no sellers-table row", () => {
    // Can happen for the seed/demo seller-name strings used in local testing
    // that don't have a real registered account.
    const map = computeSellerStatsMap([], [{ seller: "Ghost Seller", my_rating: 4 }]);
    const stats = map.get("Ghost Seller");
    expect(stats?.verified).toBe(false);
    expect(stats?.rating).toBe(4);
  });
});

describe("isValidProductImageUrl", () => {
  const prefix = "https://abcxyz.supabase.co/storage/v1/object/public/product-images/";

  it("accepts a URL under our own storage bucket", () => {
    expect(isValidProductImageUrl(`${prefix}123-photo.jpg`, prefix)).toBe(true);
  });

  it("rejects an arbitrary external URL — a listing can't point at a tracking pixel or content we don't control", () => {
    expect(isValidProductImageUrl("https://evil.example/tracker.png", prefix)).toBe(false);
  });

  it("rejects a different Supabase project's bucket, not just non-Supabase hosts", () => {
    const otherPrefix = "https://different-project.supabase.co/storage/v1/object/public/product-images/";
    expect(isValidProductImageUrl(`${otherPrefix}x.jpg`, prefix)).toBe(false);
  });
});
