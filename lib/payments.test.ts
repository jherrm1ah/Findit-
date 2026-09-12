import { describe, it, expect } from "vitest";
import { computeFeeSplit } from "./payments";

// NOTE ON SCOPE: same as lib/subscriptions.test.ts — the DB/Paystack-touching
// functions in lib/payments.ts (confirmOrderPayment, initiateSellerPayout,
// refundOrderPayment, etc.) need a real Supabase project and live Paystack
// keys to exercise and aren't covered here. What's tested is the pure fee
// math every order's payout is snapshotted from.

describe("computeFeeSplit", () => {
  it("splits an order price by the fee in basis points", () => {
    expect(computeFeeSplit(10000, 500)).toEqual({ feeAmount: 500, payoutAmount: 9500 });
  });

  it("charges nothing at 0 bps", () => {
    expect(computeFeeSplit(10000, 0)).toEqual({ feeAmount: 0, payoutAmount: 10000 });
  });

  it("takes the whole price at 10000 bps (100%)", () => {
    expect(computeFeeSplit(10000, 10000)).toEqual({ feeAmount: 10000, payoutAmount: 0 });
  });

  it("floors the fee so fee + payout never exceeds the price", () => {
    // 999 * 500 / 10000 = 49.95 -> floors to 49, so the seller gets the
    // fractional kobo rather than the platform overcharging by rounding up.
    const { feeAmount, payoutAmount } = computeFeeSplit(999, 500);
    expect(feeAmount).toBe(49);
    expect(payoutAmount).toBe(950);
    expect(feeAmount + payoutAmount).toBe(999);
  });

  it("never produces a negative payout for any bps in range", () => {
    for (const bps of [0, 1, 250, 500, 999, 10000]) {
      const { feeAmount, payoutAmount } = computeFeeSplit(12345, bps);
      expect(feeAmount).toBeGreaterThanOrEqual(0);
      expect(payoutAmount).toBeGreaterThanOrEqual(0);
      expect(feeAmount + payoutAmount).toBe(12345);
    }
  });
});
