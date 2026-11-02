import { NextRequest, NextResponse } from "next/server";
import { getOrder, cancelUnpaidOrder } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";
import { getDb, assertNoError } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { releaseCredit } from "@/lib/referrals";

// Same window as the pay route's: a checkout started this recently may be
// being paid right now.
const PAYMENT_IN_PROGRESS_MS = 15 * 60 * 1000;

// The buyer cancels an order they haven't paid for. Buyer-only, unpaid only
// (a paid order goes through "Report a problem" and a refund instead).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to cancel this order." }, { status: 401 });
  }
  const order = await getOrder(params.id);
  if (!order || order.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (order.paymentStatus === "paid") {
    return NextResponse.json(
      { error: "This order is paid, so it can't be cancelled here. Use \"Report a problem\" if something's wrong." },
      { status: 400 }
    );
  }
  if (order.status === "Cancelled") {
    return NextResponse.json({ order });
  }

  try {
    const db = getDb();
    const pendingResult = await db
      .from("payments")
      .select("id, created_at")
      .eq("order_id", order.id)
      .eq("kind", "order")
      .eq("status", "pending");
    const pending = assertNoError(pendingResult, "checking for a payment in progress") as { id: string; created_at: string }[];
    if (pending.some((p) => Date.now() - new Date(p.created_at).getTime() < PAYMENT_IN_PROGRESS_MS)) {
      return NextResponse.json(
        { error: "You have a payment in progress for this order. Finish or close it, then try again in a few minutes." },
        { status: 409 }
      );
    }

    const cancelled = await cancelUnpaidOrder(order.id, "buyer");
    if (!cancelled) {
      return NextResponse.json({ error: "This order just changed. Refresh and try again." }, { status: 409 });
    }
    // Give back any FindIt credit an abandoned checkout had set aside — the
    // same thing the pay route does before a retry.
    for (const p of pending) await releaseCredit(p.id);
    return NextResponse.json({ order: cancelled });
  } catch (err) {
    return errorResponse(err, "Couldn't cancel that order.");
  }
}
