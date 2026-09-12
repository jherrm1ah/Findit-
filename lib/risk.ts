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
//
// Grouped by business name first, then split by seller_id: business_name
// has no uniqueness constraint (see lib/sellerIdentityMatch.ts), so two
// DIFFERENT real seller accounts can share a name — merging their orders
// into one bucket would fabricate a risk signal (guilt by name collision,
// or a real high-risk seller's rate diluted by a namesake's clean record).
// seller_id uniquely identifies an account, so two distinct non-null
// seller_ids under the same name are always two different sellers and are
// never merged; orders that predate the seller_id backfill (null) are
// folded into the one account they're unambiguous for, and left out
// entirely — never guessed at — when the name is genuinely split between
// two real accounts.
export function computeSellerRiskSignals(
  orders: Array<{ seller: string; sellerId: string | null; escrowStatus: string }>
): SellerRiskSignal[] {
  const byName = new Map<string, Array<{ sellerId: string | null; escrowStatus: string }>>();
  for (const order of orders) {
    const group = byName.get(order.seller) ?? [];
    group.push(order);
    byName.set(order.seller, group);
  }

  const signals: SellerRiskSignal[] = [];
  for (const [sellerName, group] of byName) {
    const distinctIds = [...new Set(group.map((o) => o.sellerId).filter((id): id is string => id !== null))];

    const buckets =
      distinctIds.length > 1
        ? distinctIds.map((id) => ({ sellerId: id as string | null, orders: group.filter((o) => o.sellerId === id) }))
        : [{ sellerId: distinctIds[0] ?? null, orders: group }];

    for (const bucket of buckets) {
      const total = bucket.orders.length;
      const disputed = bucket.orders.filter((o) => o.escrowStatus === "disputed").length;
      if (total < MIN_ORDERS_FOR_DISPUTE_RATE || disputed === 0) continue;
      signals.push({
        sellerName,
        sellerId: bucket.sellerId,
        totalOrders: total,
        disputedOrders: disputed,
        disputeRate: disputed / total,
      });
    }
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
