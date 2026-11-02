import { describe, it, expect } from "vitest";
import { deliveryPerformance } from "./performance";

const H = 3600_000;
const now = Date.parse("2026-11-10T12:00:00Z");
const at = (hoursAgo: number) => new Date(now - hoursAgo * H).toISOString();

describe("deliveryPerformance", () => {
  it("measures dispatch speed, arrival time and on-time rate against the promised estimate", () => {
    const p = deliveryPerformance(
      [
        // dispatched after 10h, confirmed after 2 days, promised 3: on time
        { paymentStatus: "paid", status: "Delivered", paidAt: at(100), dispatchedAt: at(90), buyerConfirmedAt: at(52), deliveryMethod: "delivery", shippingOption: { etaMaxDays: 3 } },
        // dispatched after 30h, confirmed after 5 days, promised 2: late
        { paymentStatus: "paid", status: "Delivered", paidAt: at(200), dispatchedAt: at(170), buyerConfirmedAt: at(80), deliveryMethod: "delivery", shippingOption: { etaMaxDays: 2 } },
        // paid 60h ago, not sent: late to dispatch
        { paymentStatus: "paid", status: "Seller preparing", paidAt: at(60), dispatchedAt: null, buyerConfirmedAt: null },
        // paid 5h ago: waiting, not late
        { paymentStatus: "paid", status: "Seller preparing", paidAt: at(5), dispatchedAt: null, buyerConfirmedAt: null },
        // unpaid and cancelled orders don't count
        { paymentStatus: "pending", status: "Awaiting payment", paidAt: null, dispatchedAt: null, buyerConfirmedAt: null },
        { paymentStatus: "paid", status: "Cancelled", paidAt: at(10), dispatchedAt: null, buyerConfirmedAt: null },
      ],
      now
    );
    expect(p).toEqual({ paidOrders: 4, awaitingDispatch: 2, lateToDispatch: 1, avgHoursToDispatch: 20, avgDaysToArrive: 3.5, onTimeRate: 50 });
  });

  it("has no averages without data", () => {
    expect(deliveryPerformance([], now)).toMatchObject({ paidOrders: 0, avgHoursToDispatch: null, avgDaysToArrive: null, onTimeRate: null });
  });
});
