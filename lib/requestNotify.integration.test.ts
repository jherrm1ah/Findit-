import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";

// Exercises the REAL createRequest -> notifySellersOfNewRequest ->
// candidateSellersForRequest path against the fake database, not a
// reimplementation of it. lib/requestMatching.test.ts already covers the
// pure decision (dedup, self-exclusion, the cap); this covers the part that
// can actually be got wrong: which candidates the database query surfaces
// in the first place.

const fakeDb: FakeSupabase = createFakeSupabase();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeDb,
}));

process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const { createRequest } = await import("./repo");

function seller(overrides: Record<string, unknown> = {}) {
  return {
    id: "seller_1",
    user_id: "u_seller_1",
    name: "Terra Gadgets",
    status: "approved",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: "p_1",
    category: "electronics",
    name: "USB-C cable",
    price: 2500,
    seller: "Terra Gadgets",
    seller_id: "seller_1",
    active: true,
    created_at: "2026-02-01T00:00:00.000Z",
    ...overrides,
  };
}

function categories() {
  return [{ id: "electronics", label: "Electronics", icon_key: "Package", sort_order: 0, active: true, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" }];
}

function notifications() {
  return fakeDb.dump("notifications");
}

beforeEach(() => {
  fakeDb.reset();
});

describe("posting a request notifies matching sellers", () => {
  it("notifies a seller with an active listing in the request's category", async () => {
    fakeDb.reset({
      categories: categories(),
      users: [{ id: "u_buyer", phone: "+2348012340001", name: "Buyer", role: "buyer", notifications_enabled: true }],
      sellers: [seller()],
      products: [product()],
    });

    await createRequest({
      title: "USB-C cable, fast charging",
      description: null,
      category: "electronics",
      budgetMin: 2000,
      budgetMax: 5000,
      qty: 1,
      location: null,
      condition: "New",
      userId: "u_buyer",
    });

    const notes = notifications();
    expect(notes).toHaveLength(1);
    expect(notes[0].user_id).toBe("u_seller_1");
    expect(notes[0].type).toBe("request");
    expect(notes[0].body).toContain("USB-C cable, fast charging");
    expect(notes[0].body).toContain("2,000");
  });

  it("does not notify a seller whose listing is in a different category", async () => {
    fakeDb.reset({
      categories: categories(),
      users: [{ id: "u_buyer", phone: "+2348012340001", name: "Buyer", role: "buyer", notifications_enabled: true }],
      sellers: [seller()],
      products: [product({ category: "fashion" })],
    });

    await createRequest({
      title: "USB-C cable",
      description: null,
      category: "electronics",
      budgetMin: null,
      budgetMax: null,
      qty: 1,
      location: null,
      condition: "New",
      userId: "u_buyer",
    });

    expect(notifications()).toHaveLength(0);
  });

  it("does not notify a seller whose listing is inactive", async () => {
    fakeDb.reset({
      categories: categories(),
      users: [{ id: "u_buyer", phone: "+2348012340001", name: "Buyer", role: "buyer", notifications_enabled: true }],
      sellers: [seller()],
      products: [product({ active: false })],
    });

    await createRequest({
      title: "USB-C cable",
      description: null,
      category: "electronics",
      budgetMin: null,
      budgetMax: null,
      qty: 1,
      location: null,
      condition: "New",
      userId: "u_buyer",
    });

    expect(notifications()).toHaveLength(0);
  });

  it("does not notify a seller who is not approved", async () => {
    fakeDb.reset({
      categories: categories(),
      users: [{ id: "u_buyer", phone: "+2348012340001", name: "Buyer", role: "buyer", notifications_enabled: true }],
      sellers: [seller({ status: "pending" })],
      products: [product()],
    });

    await createRequest({
      title: "USB-C cable",
      description: null,
      category: "electronics",
      budgetMin: null,
      budgetMax: null,
      qty: 1,
      location: null,
      condition: "New",
      userId: "u_buyer",
    });

    expect(notifications()).toHaveLength(0);
  });

  it("ignores a legacy listing with no seller_id, rather than guessing its owner", async () => {
    fakeDb.reset({
      categories: categories(),
      users: [{ id: "u_buyer", phone: "+2348012340001", name: "Buyer", role: "buyer", notifications_enabled: true }],
      sellers: [seller()],
      products: [product({ seller_id: null })],
    });

    await createRequest({
      title: "USB-C cable",
      description: null,
      category: "electronics",
      budgetMin: null,
      budgetMax: null,
      qty: 1,
      location: null,
      condition: "New",
      userId: "u_buyer",
    });

    expect(notifications()).toHaveLength(0);
  });

  it("notifies every approved seller when the buyer leaves the category open", async () => {
    fakeDb.reset({
      categories: categories(),
      users: [{ id: "u_buyer", phone: "+2348012340001", name: "Buyer", role: "buyer", notifications_enabled: true }],
      sellers: [seller(), seller({ id: "seller_2", user_id: "u_seller_2", name: "Another Shop" })],
      products: [],
    });

    await createRequest({
      title: "Anything reasonably priced",
      description: null,
      category: null,
      budgetMin: null,
      budgetMax: null,
      qty: 1,
      location: null,
      condition: "New",
      userId: "u_buyer",
    });

    const recipients = notifications().map((n) => n.user_id as string).sort();
    expect(recipients).toEqual(["u_seller_1", "u_seller_2"]);
  });

  it("never notifies the requester about their own request", async () => {
    // A seller posting a buyer request for something in their own category.
    fakeDb.reset({
      categories: categories(),
      users: [{ id: "u_seller_1", phone: "+2348012340001", name: "Terra", role: "seller", notifications_enabled: true }],
      sellers: [seller()],
      products: [product()],
    });

    await createRequest({
      title: "USB-C cable",
      description: null,
      category: "electronics",
      budgetMin: null,
      budgetMax: null,
      qty: 1,
      location: null,
      condition: "New",
      userId: "u_seller_1",
    });

    expect(notifications()).toHaveLength(0);
  });

  it("respects a seller's own notification preference", async () => {
    fakeDb.reset({
      categories: categories(),
      users: [
        { id: "u_buyer", phone: "+2348012340001", name: "Buyer", role: "buyer", notifications_enabled: true },
        // notifyBestEffort checks this on the OWNING user account, not the
        // sellers row.
        { id: "u_seller_1", phone: "+2348012340002", name: "Terra Owner", role: "seller", notifications_enabled: false },
      ],
      sellers: [seller()],
      products: [product()],
    });

    await createRequest({
      title: "USB-C cable",
      description: null,
      category: "electronics",
      budgetMin: null,
      budgetMax: null,
      qty: 1,
      location: null,
      condition: "New",
      userId: "u_buyer",
    });

    expect(notifications()).toHaveLength(0);
  });

  it("still returns a normal request when there is nobody to notify", async () => {
    // No sellers exist at all for this category — the buyer's post must
    // succeed exactly as if a matching seller existed.
    fakeDb.reset({
      categories: categories(),
      users: [{ id: "u_buyer", phone: "+2348012340001", name: "Buyer", role: "buyer", notifications_enabled: true }],
      sellers: [],
      products: [],
    });

    const request = await createRequest({
      title: "Something",
      description: null,
      category: "electronics",
      budgetMin: null,
      budgetMax: null,
      qty: 1,
      location: null,
      condition: "New",
      userId: "u_buyer",
    });

    expect(request.id).toMatch(/^REQ-/);
    expect(notifications()).toHaveLength(0);
  });
});
