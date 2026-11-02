// How a seller's deliveries are going, from their own paid orders. Pure.

type OrderLike = {
  paymentStatus: string;
  status: string;
  paidAt: string | null;
  dispatchedAt: string | null;
  buyerConfirmedAt: string | null;
  deliveryMethod?: string | null;
  shippingOption?: { etaMaxDays?: number | null } | null;
};

const HOUR = 60 * 60 * 1000;
export const DISPATCH_TARGET_HOURS = 48;

export type DeliveryPerformance = {
  paidOrders: number;
  awaitingDispatch: number;
  lateToDispatch: number; // paid more than DISPATCH_TARGET_HOURS ago, not dispatched
  avgHoursToDispatch: number | null;
  avgDaysToArrive: number | null; // payment to the buyer confirming
  onTimeRate: number | null; // share of confirmed deliveries within the promised estimate
};

export function deliveryPerformance(orders: OrderLike[], now = Date.now()): DeliveryPerformance {
  const paid = orders.filter((o) => o.paymentStatus === "paid" && o.status !== "Cancelled" && o.paidAt);
  const dispatched = paid.filter((o) => o.dispatchedAt);
  const waiting = paid.filter((o) => !o.dispatchedAt && !o.buyerConfirmedAt);
  const confirmed = paid.filter((o) => o.buyerConfirmedAt);
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const withPromise = confirmed.filter((o) => o.deliveryMethod === "delivery" && o.shippingOption?.etaMaxDays != null);
  const onTime = withPromise.filter(
    (o) => (Date.parse(o.buyerConfirmedAt as string) - Date.parse(o.paidAt as string)) / (24 * HOUR) <= (o.shippingOption?.etaMaxDays as number) + 1
  );
  return {
    paidOrders: paid.length,
    awaitingDispatch: waiting.length,
    lateToDispatch: waiting.filter((o) => now - Date.parse(o.paidAt as string) > DISPATCH_TARGET_HOURS * HOUR).length,
    avgHoursToDispatch: avg(dispatched.map((o) => (Date.parse(o.dispatchedAt as string) - Date.parse(o.paidAt as string)) / HOUR)),
    avgDaysToArrive: avg(confirmed.map((o) => (Date.parse(o.buyerConfirmedAt as string) - Date.parse(o.paidAt as string)) / (24 * HOUR))),
    onTimeRate: withPromise.length ? Math.round((onTime.length / withPromise.length) * 100) : null,
  };
}
