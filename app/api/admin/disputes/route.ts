import { NextRequest, NextResponse } from "next/server";
import { listDisputedOrders, resolveOrderIssue, logAdminAction } from "@/lib/repo";
import { initiateSellerPayout, refundOrderPayment } from "@/lib/payments";
import { requireAdmin } from "@/lib/adminRoles";
import { errorResponse } from "@/lib/errors";

// Orders where the buyer reported a problem and the money is still held.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req, "moderation");
  if (admin instanceof NextResponse) return admin;
  try {
    return NextResponse.json({ orders: await listDisputedOrders() });
  } catch (err) {
    return errorResponse(err, "Couldn't load reported orders.");
  }
}

// An admin decides: pay the seller, or refund the buyer.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req, "moderation");
  if (admin instanceof NextResponse) return admin;

  let body: { orderId?: string; outcome?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.orderId) {
    return NextResponse.json({ error: "Missing order." }, { status: 400 });
  }
  if (body.outcome !== "released" && body.outcome !== "refunded") {
    return NextResponse.json({ error: "Choose whether to release the payment or refund the buyer." }, { status: 400 });
  }

  try {
    const order = await resolveOrderIssue(body.orderId, body.outcome);
    if (!order) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Real money movement, not just the status flip above — this decision
    // either pays the seller or reverses the buyer's original charge for
    // real. Awaited (not fire-and-forget) so the admin who made this call
    // sees whether it actually happened, unlike the buyer's own
    // confirm-delivery path where payout failure is logged, not blocking.
    let moneyMovement: { refunded?: boolean; reason?: string } = {};
    if (body.outcome === "released") {
      await initiateSellerPayout(order).catch((err) => {
        moneyMovement = { reason: err instanceof Error ? err.message : "Payout initiation failed." };
      });
    } else {
      moneyMovement = await refundOrderPayment(order.id);
    }

    // Money decisions are exactly what an audit trail is for.
    await logAdminAction({
      adminId: admin.id,
      action: body.outcome === "refunded" ? "order.refunded" : "order.payment_released",
      targetType: "order",
      targetId: order.id,
      detail: { item: order.item, seller: order.seller, ...moneyMovement },
    });
    return NextResponse.json({ order, ...moneyMovement });
  } catch (err) {
    return errorResponse(err, "Couldn't resolve that report.");
  }
}
