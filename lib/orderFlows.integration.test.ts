import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";
import { acceptOffer, confirmDelivery, listOrders, resolveOrderIssue, reportOrderIssue } from "./repo";
import { confirmOrderPayment, refundOrderPayment } from "./payments";

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

  // The other half of the same race: accepting the SAME offer twice is
  // guarded above, but nothing stopped accepting two DIFFERENT offers on
  // one request — a buyer double-tapping "Accept" on two separate offers
  // before the list refreshes (the client only disables the one button
  // tapped, not the whole request card) would create two real orders for
  // a request that should only ever be matched once.
  it("creates exactly one order when two different offers on the same request are both accepted", async () => {
    fakeDb.reset({
      requests: [{ id: "req_1", user_id: "buyer_1", title: "Need a blender", status: "open", created_at: new Date().toISOString() }],
      offers: [
        { id: "off_1", request_id: "req_1", seller: "Kemi's Kitchen", seller_id: "seller_1", price: 15000, accepted: false, created_at: new Date().toISOString() },
        { id: "off_2", request_id: "req_1", seller: "Terra Gadgets", seller_id: "seller_2", price: 14000, accepted: false, created_at: new Date().toISOString() },
      ],
      orders: [],
    });

    const [first, second] = await Promise.all([
      acceptOffer("req_1", "off_1", "buyer_1"),
      acceptOffer("req_1", "off_2", "buyer_1"),
    ]);

    const successes = [first, second].filter((r) => r !== null);
    expect(successes).toHaveLength(1);
    expect(fakeDb.dump("orders")).toHaveLength(1);
    expect(fakeDb.dump("requests")[0].status).toBe("matched");
    // Only the winning offer is marked accepted — the loser is untouched.
    const acceptedOffers = fakeDb.dump("offers").filter((o) => o.accepted);
    expect(acceptedOffers).toHaveLength(1);
  });

  it("refuses to accept an offer on a request that's already matched", async () => {
    fakeDb.reset({
      requests: [{ id: "req_1", user_id: "buyer_1", title: "Need a blender", status: "open", created_at: new Date().toISOString() }],
      offers: [
        { id: "off_1", request_id: "req_1", seller: "Kemi's Kitchen", seller_id: "seller_1", price: 15000, accepted: false, created_at: new Date().toISOString() },
        { id: "off_2", request_id: "req_1", seller: "Someone Else", seller_id: "seller_2", price: 9000, accepted: false, created_at: new Date().toISOString() },
      ],
      orders: [],
    });
    await acceptOffer("req_1", "off_1", "buyer_1");

    const result = await acceptOffer("req_1", "off_2", "buyer_1");
    expect(result).toBeNull();
    expect(fakeDb.dump("orders")).toHaveLength(1);
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

describe("listOrders — business-name collision", () => {
  // business_name has no uniqueness constraint (see the seller_id
  // migration rationale in lib/sellerIdentityMatch.ts) — two different
  // seller accounts, "seller_1" and "seller_2", both named "Kemi's
  // Kitchen" here on purpose.
  function seedTwoSellersSharingAName() {
    fakeDb.reset({
      orders: [
        { id: "ORD-1", user_id: "buyer_1", item: "Blender", seller: "Kemi's Kitchen", seller_id: "seller_1", price: 15000, status: "Awaiting payment", created_at: new Date().toISOString() },
        { id: "ORD-2", user_id: "buyer_2", item: "Kettle", seller: "Kemi's Kitchen", seller_id: "seller_2", price: 8000, status: "Awaiting payment", created_at: new Date().toISOString() },
        // Predates the seller_id backfill — no seller_id at all, so it
        // can't be misattributed to whichever seller_id we filter by.
        { id: "ORD-3", user_id: "buyer_3", item: "Toaster", seller: "Kemi's Kitchen", seller_id: null, price: 6000, status: "Delivered", created_at: new Date().toISOString() },
      ],
    });
  }

  it("never returns another seller's orders just because the business name matches", async () => {
    seedTwoSellersSharingAName();

    const orders = await listOrders("seller_user_1", { name: "Kemi's Kitchen", id: "seller_1" });

    const ids = orders.map((o) => o.id).sort();
    expect(ids).toEqual(["ORD-1", "ORD-3"]); // their own order + the unbackfilled legacy one, never ORD-2
  });

  it("still surfaces the other seller's own orders when THEY ask, not mixed together", async () => {
    seedTwoSellersSharingAName();

    const orders = await listOrders("seller_user_2", { name: "Kemi's Kitchen", id: "seller_2" });

    const ids = orders.map((o) => o.id).sort();
    expect(ids).toEqual(["ORD-2", "ORD-3"]);
  });
});

describe("releasing escrow on an order nobody paid for", () => {
  // The state every order on this platform was in before the payment flow
  // existed: escrow said "held" while payment_status said "pending" and no
  // payment row existed at all. Migration 021 backfills those to 'unpaid' and
  // then forbids the combination outright, but the code must refuse it too —
  // a database constraint firing is a 500, not an explanation.
  function seedUnpaidDispatchedOrder(overrides: Record<string, unknown> = {}) {
    fakeDb.reset({
      orders: [
        {
          id: "ORD-1",
          user_id: "buyer_1",
          item: "Blender",
          seller: "Kemi's Kitchen",
          seller_id: "seller_1",
          price: 15000,
          status: "Out for delivery",
          escrow_status: "unpaid",
          payment_status: "pending",
          buyer_confirmed_at: null,
          created_at: new Date().toISOString(),
          ...overrides,
        },
      ],
    });
  }

  it("refuses to confirm delivery on an unpaid order", async () => {
    seedUnpaidDispatchedOrder();

    await expect(confirmDelivery("ORD-1", "buyer_1")).rejects.toThrow(/hasn't been paid for/i);

    // And crucially, nothing moved: no release, no payout to schedule.
    const [order] = fakeDb.dump("orders");
    expect(order.escrow_status).toBe("unpaid");
    expect(order.buyer_confirmed_at).toBeNull();
  });

  it("still confirms delivery normally once the order is actually paid", async () => {
    seedUnpaidDispatchedOrder({
      escrow_status: "held",
      payment_status: "paid",
      platform_fee_bps: 200,
      platform_fee_amount: 300,
      seller_payout_amount: 14700,
    });

    const order = await confirmDelivery("ORD-1", "buyer_1");

    expect(order?.escrowStatus).toBe("released");
    expect(order?.status).toBe("Delivered");
  });

  it("refuses to resolve a dispute as released when the order was never paid", async () => {
    seedUnpaidDispatchedOrder({ escrow_status: "disputed", issue_reported_at: new Date().toISOString() });

    await expect(resolveOrderIssue("ORD-1", "released")).rejects.toThrow(/never paid for/i);

    const [order] = fakeDb.dump("orders");
    expect(order.escrow_status).toBe("disputed");
  });

  it("still allows refunding a disputed order that was never paid", async () => {
    // Refunding is the honest resolution here: it closes the report and
    // leaves the order in a state that matches reality.
    seedUnpaidDispatchedOrder({ escrow_status: "disputed", issue_reported_at: new Date().toISOString() });

    const order = await resolveOrderIssue("ORD-1", "refunded");

    expect(order?.escrowStatus).toBe("refunded");
  });
});

describe("confirmDelivery vs reportOrderIssue — mutual exclusion race", () => {
  // The actual bug: confirmDelivery's atomic guard was buyer_confirmed_at
  // IS NULL; reportOrderIssue's was issue_reported_at IS NULL — two
  // DIFFERENT columns on the same row, so a buyer who fires both close
  // together (two tabs, a double-tap across adjacent buttons) could have
  // BOTH succeed: confirmDelivery releases escrow and the route triggers a
  // real Paystack payout, while reportOrderIssue's write lands right after
  // and flips escrow_status to 'disputed' — leaving the seller already
  // paid on an order that now reads as an open dispute an admin might
  // refund too. Both now gate on escrow_status itself, matched against
  // exactly what each read, so they're mutually exclusive under a race.
  function seedPaidDispatchedOrder() {
    fakeDb.reset({
      orders: [
        {
          id: "ORD-1",
          user_id: "buyer_1",
          item: "Blender",
          seller: "Kemi's Kitchen",
          seller_id: "seller_1",
          price: 15000,
          status: "Out for delivery",
          escrow_status: "held",
          payment_status: "paid",
          buyer_confirmed_at: null,
          issue_reported_at: null,
          platform_fee_bps: 200,
          platform_fee_amount: 300,
          seller_payout_amount: 14700,
          created_at: new Date().toISOString(),
        },
      ],
      users: [{ id: "seller_user_1", role: "seller", business_name: "Kemi's Kitchen", name: "Kemi", notifications_enabled: true }],
      notifications: [],
    });
  }

  it("lets only one of confirm-delivery and report-issue win when fired concurrently", async () => {
    seedPaidDispatchedOrder();

    const [confirmResult, reportResult] = await Promise.allSettled([
      confirmDelivery("ORD-1", "buyer_1"),
      reportOrderIssue("ORD-1", "buyer_1", "It arrived broken and doesn't turn on."),
    ]);

    const succeeded = [confirmResult, reportResult].filter((r) => r.status === "fulfilled");
    expect(succeeded).toHaveLength(1);

    // The final row reflects exactly one outcome, never a mix of both
    // (e.g. escrow_status changed by the loser after the winner committed).
    const [row] = fakeDb.dump("orders");
    if (confirmResult.status === "fulfilled") {
      expect(row.escrow_status).toBe("released");
      expect(row.issue_reported_at).toBeNull();
    } else {
      expect(row.escrow_status).toBe("disputed");
      expect(row.buyer_confirmed_at).toBeNull();
    }
  });

  it("still confirms delivery normally with no race in play", async () => {
    seedPaidDispatchedOrder();
    const order = await confirmDelivery("ORD-1", "buyer_1");
    expect(order?.escrowStatus).toBe("released");
  });

  it("still reports an issue normally with no race in play", async () => {
    seedPaidDispatchedOrder();
    const order = await reportOrderIssue("ORD-1", "buyer_1", "It arrived broken and doesn't turn on.");
    expect(order?.escrowStatus).toBe("disputed");
  });
});

describe("reportOrderIssue — post-confirmation window", () => {
  function seedConfirmedOrder(buyerConfirmedAt: string) {
    fakeDb.reset({
      orders: [
        {
          id: "ORD-1",
          user_id: "buyer_1",
          item: "Blender",
          seller: "Kemi's Kitchen",
          seller_id: "seller_1",
          price: 15000,
          status: "Delivered",
          escrow_status: "released",
          payment_status: "paid",
          buyer_confirmed_at: buyerConfirmedAt,
          issue_reported_at: null,
          created_at: new Date().toISOString(),
        },
      ],
      users: [{ id: "seller_user_1", role: "seller", business_name: "Kemi's Kitchen", name: "Kemi", notifications_enabled: true }],
      notifications: [],
    });
  }

  it("lets a buyer report a problem a couple of days after confirming delivery", async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    seedConfirmedOrder(twoDaysAgo);

    const order = await reportOrderIssue("ORD-1", "buyer_1", "It arrived broken and doesn't turn on.");

    expect(order?.escrowStatus).toBe("disputed");
    const [row] = fakeDb.dump("orders");
    expect(row.escrow_status).toBe("disputed");
    expect(row.issue_reported_at).not.toBeNull();
  });

  it("refuses a report filed more than the window after confirming delivery", async () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    seedConfirmedOrder(twoWeeksAgo);

    await expect(reportOrderIssue("ORD-1", "buyer_1", "It arrived broken and doesn't turn on.")).rejects.toThrow(/window .* has passed/i);

    const [row] = fakeDb.dump("orders");
    expect(row.escrow_status).toBe("released"); // untouched
  });

  it("still refuses a report on an order with no confirmation timestamp at all", async () => {
    // Defensive: a released order should always carry buyer_confirmed_at,
    // but a missing one must fail closed, not open the window forever.
    seedConfirmedOrder(null as unknown as string);

    await expect(reportOrderIssue("ORD-1", "buyer_1", "It arrived broken and doesn't turn on.")).rejects.toThrow(/window .* has passed/i);
  });
});

describe("refundOrderPayment — guards against paying twice", () => {
  it("refuses to refund the buyer when the seller has already been paid out", async () => {
    fakeDb.reset({
      payments: [
        {
          id: "pay_1",
          order_id: "ORD-1",
          kind: "order",
          status: "success",
          provider_reference: "ref_123",
          paid_at: new Date().toISOString(),
        },
      ],
      payouts: [{ id: "payout_1", order_id: "ORD-1", seller_id: "seller_1", amount: 14250, status: "paid" }],
    });

    const result = await refundOrderPayment("ORD-1");

    expect(result.refunded).toBe(false);
    expect(result.reason).toMatch(/already been paid out/i);
  });

  it("still refuses when there's no payment on file at all, unaffected by the payout guard", async () => {
    fakeDb.reset({ payments: [], payouts: [] });

    const result = await refundOrderPayment("ORD-1");

    expect(result.refunded).toBe(false);
    expect(result.reason).toMatch(/no successful payment/i);
  });
});
