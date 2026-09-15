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

const { initiateSellerPayout } = await import("./payments");
const { PaystackNetworkError } = await import("./paystack");

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
