import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";

// Exercises the REAL listPublicSellerDirectory -> database query path
// against the fake Supabase client, not a reimplementation of it.
// lib/sellerDirectory.test.ts already covers the pure decision logic
// (buildPublicSellerDirectory); this covers what the database query
// actually surfaces — in particular, the "approved sellers only" filter,
// which lives in the query itself, not in the pure function.

const fakeDb: FakeSupabase = createFakeSupabase();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeDb,
}));

process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const { listPublicSellerDirectory } = await import("./sellerDirectory");

function seller(overrides: Record<string, unknown> = {}) {
  return {
    id: "seller_1",
    name: "Terra Gadgets",
    status: "approved",
    logo_url: null,
    banner_url: null,
    seller_type: "online_business",
    category: "electronics",
    public_state: "Lagos",
    public_city: null,
    public_area: null,
    verification_status: "approved",
    store_slug: null,
    created_at: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  fakeDb.reset();
});

describe("listPublicSellerDirectory", () => {
  it("lists an approved seller", async () => {
    fakeDb.reset({ sellers: [seller()], orders: [], products: [], subscriptions: [] });

    const sellers = await listPublicSellerDirectory();

    expect(sellers).toHaveLength(1);
    expect(sellers[0].id).toBe("seller_1");
    expect(sellers[0].name).toBe("Terra Gadgets");
  });

  it("never lists a pending, rejected, or suspended seller", async () => {
    fakeDb.reset({
      sellers: [
        seller({ id: "s_pending", status: "pending" }),
        seller({ id: "s_rejected", status: "rejected" }),
        seller({ id: "s_suspended", status: "suspended" }),
      ],
      orders: [],
      products: [],
      subscriptions: [],
    });

    const sellers = await listPublicSellerDirectory();

    expect(sellers).toHaveLength(0);
  });

  it("returns an empty list rather than erroring when nobody is approved yet", async () => {
    fakeDb.reset({ sellers: [], orders: [], products: [], subscriptions: [] });

    expect(await listPublicSellerDirectory()).toEqual([]);
  });

  it("counts this seller's active listings, not another seller's", async () => {
    fakeDb.reset({
      sellers: [seller(), seller({ id: "seller_2", name: "Other Shop" })],
      orders: [],
      products: [
        { id: "p1", seller_id: "seller_1", active: true },
        { id: "p2", seller_id: "seller_1", active: true },
        { id: "p3", seller_id: "seller_1", active: false }, // inactive — must not count
        { id: "p4", seller_id: "seller_2", active: true }, // a different seller
      ],
      subscriptions: [],
    });

    const sellers = await listPublicSellerDirectory();
    const terra = sellers.find((s) => s.id === "seller_1")!;
    expect(terra.activeListingCount).toBe(2);
  });

  it("rolls up this seller's own rating and completed-order count", async () => {
    fakeDb.reset({
      sellers: [seller()],
      orders: [
        { id: "o1", seller_id: "seller_1", reviewed: true, my_rating: 5, escrow_status: "released" },
        { id: "o2", seller_id: "seller_1", reviewed: true, my_rating: 3, escrow_status: "released" },
      ],
      products: [],
      subscriptions: [],
    });

    const [result] = await listPublicSellerDirectory();
    expect(result.rating).toBe(4);
    expect(result.completedOrderCount).toBe(2);
  });
});
