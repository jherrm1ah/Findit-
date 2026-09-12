import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";
import { acceptOffer } from "./repo";
import { confirmOrderPayment } from "./payments";

// These exercise the ACTUAL lib/repo.ts / lib/payments.ts functions against
// an in-memory fake Supabase client (lib/testing/fakeSupabase.ts) — not
// reimplemented test-only logic. Every other test in this suite covers pure
// functions extracted specifically to be unit-testable; these instead run
// the real multi-step, multi-table flows a live database would run, for
// the two races a security audit found and fixed in this codebase:
// double-accepting an offer, and a Paystack webhook redelivering the same
// "payment succeeded" event twice. See lib/repo.ts#acceptOffer and
// lib/payments.ts#confirmOrderPayment for the guards under test.
//
// This sandbox has no outbound network access to a real Supabase project
// (see README "Testing"), so this is the closest thing to an end-to-end
// test this environment can run — a real gap remains for anything this
// fake doesn't model (RLS, actual Postgres constraint enforcement, network
// failures). Extend this file with more flows (confirmDelivery/escrow
// release, resolveOrderIssue) following the same pattern before reaching
// for more unit tests of already-pure logic.

// getDb() (lib/db.ts) memoizes the client returned by createClient() the
// FIRST time it's called and reuses that exact object for the rest of this
// test file's module lifetime — so this has to be one object whose
// contents we reset between tests, never a variable we reassign, or later
// tests would keep talking to a stale fake nobody reads from anymore.
const fakeDb: FakeSupabase = createFakeSupabase();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeDb,
}));

process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

beforeEach(() => {
  fakeDb.reset();
});

describe("acceptOffer — double-accept race", () => {
  function seedOpenRequestWithOffer() {
    fakeDb.reset({
      requests: [{ id: "req_1", user_id: "buyer_1", title: "Need a blender", status: "open", created_at: new Date().toISOString() }],
      offers: [
        {
          id: "off_1",
          request_id: "req_1",
          seller: "Kemi's Kitchen",
          seller_id: "seller_1",
          price: 15000,
          accepted: false,
          created_at: new Date().toISOString(),
        },
      ],
      orders: [],
    });
  }

  it("creates exactly one order when the same offer is accepted twice", async () => {
    seedOpenRequestWithOffer();

    const [first, second] = await Promise.all([
      acceptOffer("req_1", "off_1", "buyer_1"),
      acceptOffer("req_1", "off_1", "buyer_1"),
    ]);

    // Exactly one of the two concurrent-looking calls actually created the
    // order; the other sees the offer already accepted and returns null,
    // the same shape as "not found" — never a second real order.
    const results = [first, second];
    const successes = results.filter((r) => r !== null);
    expect(successes).toHaveLength(1);
    expect(fakeDb.dump("orders")).toHaveLength(1);
    expect(fakeDb.dump("orders")[0].price).toBe(15000);
  });

  it("still works normally when accepted only once", async () => {
    seedOpenRequestWithOffer();

    const result = await acceptOffer("req_1", "off_1", "buyer_1");

    expect(result).not.toBeNull();
    expect(result!.order.status).toBe("Awaiting payment");
    expect(fakeDb.dump("orders")).toHaveLength(1);
  });

  it("refuses to accept an offer on a request that isn't the caller's", async () => {
    seedOpenRequestWithOffer();

    const result = await acceptOffer("req_1", "off_1", "someone_else");

    expect(result).toBeNull();
    expect(fakeDb.dump("orders")).toHaveLength(0);
  });
});

describe("confirmOrderPayment — webhook redelivery", () => {
  function seedPendingOrder() {
    fakeDb.reset({
      orders: [
        {
          id: "ORD-1",
          user_id: "buyer_1",
          item: "Blender",
          seller: "Kemi's Kitchen",
          seller_id: "seller_1",
          price: 15000,
          status: "Awaiting payment",
          payment_status: "pending",
          escrow_status: "unpaid",
          created_at: new Date().toISOString(),
        },
      ],
      platform_fee_config: [{ id: "fee_1", fee_bps: 500, created_at: new Date().toISOString() }],
      users: [
        {
          id: "seller_user_1",
          role: "seller",
          business_name: "Kemi's Kitchen",
          name: "Kemi",
          notifications_enabled: true,
        },
      ],
      notifications: [],
    });
  }

  it("marks the order paid, snapshots the fee split, and notifies the seller once", async () => {
    seedPendingOrder();

    await confirmOrderPayment("ORD-1");

    const [order] = fakeDb.dump("orders");
    expect(order.payment_status).toBe("paid");
    expect(order.escrow_status).toBe("held");
    expect(order.platform_fee_bps).toBe(500);
    expect(order.platform_fee_amount).toBe(750); // 15000 * 5%
    expect(order.seller_payout_amount).toBe(14250);
    expect(fakeDb.dump("notifications")).toHaveLength(1);
  });

  it("is a no-op on a redelivered webhook — never double-charges the fee or double-notifies", async () => {
    seedPendingOrder();

    await confirmOrderPayment("ORD-1");
    await confirmOrderPayment("ORD-1"); // simulates Paystack redelivering the same event

    expect(fakeDb.dump("orders")).toHaveLength(1);
    expect(fakeDb.dump("notifications")).toHaveLength(1); // not 2
  });
});
