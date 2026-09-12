import { NextRequest, NextResponse } from "next/server";
import { confirmDelivery } from "@/lib/repo";
import { initiateSellerPayout } from "@/lib/payments";
import { getSessionUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";

// The buyer confirms their order arrived. Deliberately buyer-only: this is
// what releases the money, so the seller must not be able to reach it.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to confirm this order." }, { status: 401 });
  }

  try {
    const order = await confirmDelivery(params.id, user.id);
    if (!order) {
      // Also covers an order belonging to someone else — same response
      // either way, so this can't be used to probe other people's orders.
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Best-effort: the buyer's confirmation is what matters here and must
    // succeed regardless of payout mechanics — initiateSellerPayout already
    // records its own outcome (paid/processing/manual_required/failed) on
    // the payouts ledger, so a failure here isn't silently lost, just not
    // something that should undo what the buyer just did.
    initiateSellerPayout(order).catch((err) => {
      console.error("[orders/confirm] payout initiation failed", err);
    });
    return NextResponse.json({ order });
  } catch (err) {
    return errorResponse(err, "Couldn't confirm that order.");
  }
}
