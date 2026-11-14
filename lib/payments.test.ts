import { describe, it, expect } from "vitest";
import { computeFeeSplit, paystackLocalFee } from "./payments";

// NOTE ON SCOPE: same as lib/subscriptions.test.ts — the DB/Paystack-touching
// functions in lib/payments.ts (confirmOrderPayment, initiateSellerPayout,
// refundOrderPayment, etc.) need a real Supabase project and live Paystack
// keys to exercise and aren't covered here. What's tested is the pure fee
// math every order's payout is snapshotted from.

describe("computeFeeSplit", () => {
  it("splits an order price by the fee in basis points", () => {
    expect(computeFeeSplit(10000, 500)).toEqual({ feeAmount: 500, payoutAmount: 9500 });
  });

  it("never takes less than Paystack's charge on the whole payment", () => {
    // ₦1,000 item + ₦3,000 delivery: 5% of the item is ₦50, Paystack takes 1.5% of ₦4,000 + ₦100 = ₦160.
    expect(computeFeeSplit(4000, 500, 3000)).toEqual({ feeAmount: 160, payoutAmount: 3840 });
    // When 5% is already more than Paystack's charge, the 5% applies: ₦999 → 5% = ₦49, Paystack ≈ ₦15.
    expect(computeFeeSplit(999, 500)).toEqual({ feeAmount: 49, payoutAmount: 950 });
  });

  it("estimates Paystack's local charge (1.5% + ₦100, waived under ₦2,500, capped at ₦2,000)", () => {
    expect(paystackLocalFee(1000)).toBe(15);
    expect(paystackLocalFee(2499)).toBe(38);
    expect(paystackLocalFee(2500)).toBe(138);
    expect(paystackLocalFee(12000)).toBe(280);
    expect(paystackLocalFee(1_000_000)).toBe(2000);
    expect(paystackLocalFee(0)).toBe(0);
  });

  it("charges nothing at 0 bps", () => {
    expect(computeFeeSplit(10000, 0)).toEqual({ feeAmount: 0, payoutAmount: 10000 });
  });

  it("takes the whole price at 10000 bps (100%)", () => {
    expect(computeFeeSplit(10000, 10000)).toEqual({ feeAmount: 10000, payoutAmount: 0 });
  });

  it("floors the percentage fee so fee + payout never exceeds the price", () => {
    // 99,999 * 500 / 10000 = 4999.95 -> floors to 4999 (well above Paystack's
    // charge here), so the seller gets the fractional naira.
    const { feeAmount, payoutAmount } = computeFeeSplit(99999, 500);
    expect(feeAmount).toBe(4999);
    expect(payoutAmount).toBe(95000);
    expect(feeAmount + payoutAmount).toBe(99999);
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
