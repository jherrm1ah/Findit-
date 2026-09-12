import { getDb, assertNoError } from "./db";

type Row = Record<string, unknown>;

// Real risk signals computed from actual order/dispute history — never a
// fabricated "fraud score." A seller's dispute rate is the same real signal
// computeVerificationLevel (lib/sellerVerificationLevels.ts) already uses to
// decide "Trusted," surfaced here as a ranked list for admins instead of
// folded into one buyer-facing badge.

export type SellerRiskSignal = {
  sellerName: string;
  sellerId: string | null;
  totalOrders: number;
  disputedOrders: number;
  disputeRate: number; // 0..1
};

// A seller needs at least this many real orders before a rate is shown at
// all — one dispute out of one order would read as "100% dispute rate,"
// which overstates what a single data point can actually tell an admin.
export const MIN_ORDERS_FOR_DISPUTE_RATE = 3;

// Pure — given every order's seller/escrow_status, which sellers have a
// real, statistically meaningful dispute pattern, ranked worst-first.
// Unit-testable without a database.
export function computeSellerRiskSignals(
  orders: Array<{ seller: string; sellerId: string | null; escrowStatus: string }>
): SellerRiskSignal[] {
  const bySeller = new Map<string, { sellerId: string | null; total: number; disputed: number }>();
  for (const order of orders) {
    const entry = bySeller.get(order.seller) ?? { sellerId: order.sellerId, total: 0, disputed: 0 };
    entry.total++;
    if (order.escrowStatus === "disputed") entry.disputed++;
    if (!entry.sellerId && order.sellerId) entry.sellerId = order.sellerId;
    bySeller.set(order.seller, entry);
  }

  const signals: SellerRiskSignal[] = [];
  for (const [sellerName, entry] of bySeller) {
    if (entry.total < MIN_ORDERS_FOR_DISPUTE_RATE || entry.disputed === 0) continue;
    signals.push({
      sellerName,
      sellerId: entry.sellerId,
      totalOrders: entry.total,
      disputedOrders: entry.disputed,
      disputeRate: entry.disputed / entry.total,
    });
  }

  return signals.sort((a, b) => b.disputeRate - a.disputeRate);
}

export async function getSellerRiskSignals(): Promise<SellerRiskSignal[]> {
  const db = getDb();
  const result = await db.from("orders").select("seller, seller_id, escrow_status");
  const rows = assertNoError(result, "loading orders for risk signals") as Row[];
  return computeSellerRiskSignals(
    rows.map((r) => ({
      seller: r.seller as string,
      sellerId: (r.seller_id as string | null) ?? null,
      escrowStatus: r.escrow_status as string,
    }))
  );
}
