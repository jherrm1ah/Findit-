import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";
import type { Order } from "./repo";

// Exercises the REAL initiateSellerPayout against the fake Supabase client,
// with lib/paystack.ts's network call mocked out (never a live Paystack
// account in this sandbox — see orderFlows.integration.test.ts). Specifically
// covers the fix for a real double-payout risk a billing review found: a
// transfer call that never got a response at all (a timeout — Paystack may
// have actually processed it) used to be treated identically to a transfer
// Paystack explicitly rejected, both landing on payouts.status = 'failed'.
// An admin trusting that status and paying manually on top of a transfer
// that had genuinely gone through would pay the seller twice.

const fakeDb: FakeSupabase = createFakeSupabase();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeDb,
}));

const { initiateTransfer } = vi.hoisted(() => ({ initiateTransfer: vi.fn() }));
vi.mock("./paystack", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./paystack")>();
  return { ...actual, isPaystackConfigured: () => true, initiateTransfer };
});

process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const { initiateSellerPayout, retrySellerPayout, retryStalledPayoutsBestEffort } = await import("./payments");
const { PaystackNetworkError } = await import("./paystack");
const { ValidationError } = await import("./errors");

function seedOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order_1",
    userId: "buyer_1",
    item: "USB-C cable",
    seller: "Terra Gadgets",
    sellerId: "seller_1",
    price: 5000,
    status: "Delivered",
    canReview: false,
    reviewed: false,
    myRating: null,
    reviewComment: null,
    requestId: null,
    createdAt: new Date().toISOString(),
    buyerConfirmedAt: new Date().toISOString(),
    escrowStatus: "released",
    issueReportedAt: null,
    issueNote: null,
    paymentStatus: "paid",
    paidAt: new Date().toISOString(),
    platformFeeBps: 500,
    platformFeeAmount: 250,
    sellerPayoutAmount: 4750,
    creditApplied: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeDb.reset({ sellers: [{ id: "seller_1", paystack_recipient_code: "RCP_test" }] });
});

describe("initiateSellerPayout — ambiguous transfer outcome", () => {
  it("marks the payout 'manual_required', with an explicit double-pay warning, when the transfer call never got a response", async () => {
    initiateTransfer.mockRejectedValue(new PaystackNetworkError("fetch failed"));

    await initiateSellerPayout(seedOrder());

    const [payout] = fakeDb.dump("payouts");
    expect(payout.status).toBe("manual_required");
    expect(payout.failure_reason).toMatch(/may have actually gone through/i);
    expect(payout.failure_reason).toMatch(/double payment/i);
  });

  it("marks the payout plainly 'failed' when Paystack explicitly rejected the transfer", async () => {
    initiateTransfer.mockRejectedValue(new Error("Insufficient balance in the payout account."));

    await initiateSellerPayout(seedOrder());

    const [payout] = fakeDb.dump("payouts");
    expect(payout.status).toBe("failed");
    expect(payout.failure_reason).toBe("Insufficient balance in the payout account.");
    expect(payout.failure_reason).not.toMatch(/double payment/i);
  });

  it("still marks the payout 'paid' on an actual success", async () => {
    initiateTransfer.mockResolvedValue({ status: "success", transferCode: "TRF_123" });

    await initiateSellerPayout(seedOrder());

    const [payout] = fakeDb.dump("payouts");
    expect(payout.status).toBe("paid");
  });
});

// Covers the real gap found live: a buyer confirms delivery before the
// seller has added a payout bank account, so the payout lands
// manual_required — and nothing used to re-attempt it once the seller
// finally did add one. retrySellerPayout is the on-demand (admin "Retry"
// button) half; retryStalledPayoutsBestEffort is the automatic half,
// fired right after a seller saves their payout account.
describe("retrySellerPayout", () => {
  function seedManualRequiredPayout(overrides: Record<string, unknown> = {}) {
    fakeDb.reset({
      sellers: [{ id: "seller_1", paystack_recipient_code: null }],
      orders: [{ id: "order_1", user_id: "buyer_1", item: "USB-C cable", seller: "Terra Gadgets", seller_id: "seller_1", price: 5000, status: "Delivered" }],
      payouts: [{ id: "payout_1", seller_id: "seller_1", order_id: "order_1", amount: 4750, status: "manual_required", failure_reason: "This seller hasn't added a payout bank account yet.", ...overrides }],
    });
  }

  it("refuses to retry while the seller still has no payout account", async () => {
    seedManualRequiredPayout();
    await expect(retrySellerPayout("payout_1")).rejects.toThrow(/still hasn't added a payout bank account/i);
  });

  it("succeeds once the seller has added a payout account", async () => {
    fakeDb.reset({
      sellers: [{ id: "seller_1", paystack_recipient_code: "RCP_test" }],
      orders: [{ id: "order_1", user_id: "buyer_1", item: "USB-C cable", seller: "Terra Gadgets", seller_id: "seller_1", price: 5000, status: "Delivered" }],
      payouts: [{ id: "payout_1", seller_id: "seller_1", order_id: "order_1", amount: 4750, status: "manual_required", failure_reason: "This seller hasn't added a payout bank account yet." }],
    });
    initiateTransfer.mockResolvedValue({ status: "success", transferCode: "TRF_456" });

    await retrySellerPayout("payout_1");

    const [payout] = fakeDb.dump("payouts");
    expect(payout.status).toBe("paid");
    expect(payout.failure_reason).toBeNull();
  });

  // Paystack treats a transfer reference as a one-time idempotency key —
  // reusing one it already has a record for (even from a failed attempt
  // that genuinely reached Paystack) gets rejected as a duplicate. A retry
  // that sent the same reference as the original attempt would silently
  // fail every time, defeating the whole point of the Retry button.
  it("uses a different Paystack transfer reference than the original attempt", async () => {
    fakeDb.reset({
      sellers: [{ id: "seller_1", paystack_recipient_code: "RCP_test" }],
      orders: [{ id: "order_1", user_id: "buyer_1", item: "USB-C cable", seller: "Terra Gadgets", seller_id: "seller_1", price: 5000, status: "Delivered" }],
      payouts: [{ id: "payout_1", seller_id: "seller_1", order_id: "order_1", amount: 4750, status: "failed", failure_reason: "Insufficient balance in the payout account." }],
    });
    initiateTransfer.mockResolvedValue({ status: "success", transferCode: "TRF_456" });

    await retrySellerPayout("payout_1");

    expect(initiateTransfer).toHaveBeenCalledTimes(1);
    const callArgs = initiateTransfer.mock.calls[0][0];
    expect(callArgs.reference).not.toBe("payout_1");
    expect(callArgs.reference).toMatch(/^payout_1-RT/);
  });

  it("refuses to retry a payout that's already paid", async () => {
    seedManualRequiredPayout({ status: "paid" });
    await expect(retrySellerPayout("payout_1")).rejects.toThrow(/nothing to retry/i);
  });

  it("refuses to retry a payout that doesn't exist", async () => {
    seedManualRequiredPayout();
    await expect(retrySellerPayout("payout_missing")).rejects.toThrow(ValidationError);
  });
});

describe("retryStalledPayoutsBestEffort", () => {
  it("retries every manual_required payout for the seller, but never a 'failed' one", async () => {
    fakeDb.reset({
      sellers: [{ id: "seller_1", paystack_recipient_code: "RCP_test" }],
      orders: [
        { id: "order_1", user_id: "buyer_1", item: "Cable", seller: "Terra Gadgets", seller_id: "seller_1", price: 5000, status: "Delivered" },
        { id: "order_2", user_id: "buyer_2", item: "Case", seller: "Terra Gadgets", seller_id: "seller_1", price: 3000, status: "Delivered" },
      ],
      payouts: [
        { id: "payout_1", seller_id: "seller_1", order_id: "order_1", amount: 4750, status: "manual_required", failure_reason: "no account" },
        { id: "payout_2", seller_id: "seller_1", order_id: "order_2", amount: 2850, status: "failed", failure_reason: "Paystack rejected this transfer." },
      ],
    });
    initiateTransfer.mockResolvedValue({ status: "success", transferCode: "TRF_789" });

    await retryStalledPayoutsBestEffort("seller_1");

    const payouts = fakeDb.dump("payouts");
    expect(payouts.find((p) => p.id === "payout_1")?.status).toBe("paid");
    // The 'failed' payout was left alone — never silently retried.
    expect(payouts.find((p) => p.id === "payout_2")?.status).toBe("failed");
    expect(initiateTransfer).toHaveBeenCalledTimes(1);
  });

  it("keeps sweeping the rest even if one payout's retry throws", async () => {
    fakeDb.reset({
      sellers: [{ id: "seller_1", paystack_recipient_code: "RCP_test" }],
      orders: [
        { id: "order_1", user_id: "buyer_1", item: "Cable", seller: "Terra Gadgets", seller_id: "seller_1", price: 5000, status: "Delivered" },
        { id: "order_2", user_id: "buyer_2", item: "Case", seller: "Terra Gadgets", seller_id: "seller_1", price: 3000, status: "Delivered" },
      ],
      payouts: [
        { id: "payout_1", seller_id: "seller_1", order_id: "order_1", amount: 4750, status: "manual_required", failure_reason: "no account" },
        { id: "payout_2", seller_id: "seller_1", order_id: "order_2", amount: 2850, status: "manual_required", failure_reason: "no account" },
      ],
    });
    initiateTransfer
      .mockRejectedValueOnce(new Error("Insufficient balance in the payout account."))
      .mockResolvedValueOnce({ status: "success", transferCode: "TRF_999" });

    await expect(retryStalledPayoutsBestEffort("seller_1")).resolves.toBeUndefined();

    const payouts = fakeDb.dump("payouts");
    expect(payouts.find((p) => p.status === "failed")).toBeTruthy();
    expect(payouts.find((p) => p.status === "paid")).toBeTruthy();
  });
});
