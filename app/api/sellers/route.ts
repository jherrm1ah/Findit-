import { NextRequest, NextResponse } from "next/server";
import { listSellers, activeProductCountsBySeller } from "@/lib/repo";
import { getStorePlanDisplayMap } from "@/lib/subscriptions";
import { requireAdmin } from "@/lib/adminRoles";
import { errorResponse } from "@/lib/errors";

// Admin-only seller list — the same "moderation" domain that gates the
// seller-account actions (approve/reject/suspend) in AdminQueue, since this
// list exists to feed that screen. Enriched with real store info (current
// plan, active listing count) so an admin isn't just approving accounts
// blind — no separate "store" table to query, since a seller's store IS
// their subscription + their products; this just reads both in bulk
// (no N+1) and joins them onto the seller list already being computed.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req, "moderation");
  if (admin instanceof NextResponse) return admin;

  try {
    const [sellers, productCounts, planMap] = await Promise.all([
      listSellers(),
      activeProductCountsBySeller(),
      getStorePlanDisplayMap(),
    ]);
    const withStoreInfo = sellers.map((seller) => ({
      ...seller,
      activeProductCount: productCounts.get(seller.id) ?? 0,
      planName: planMap.get(seller.id)?.planName ?? null,
    }));
    return NextResponse.json({ sellers: withStoreInfo });
  } catch (err) {
    return errorResponse(err, "Couldn't load sellers.");
  }
}
