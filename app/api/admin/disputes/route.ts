import { NextRequest, NextResponse } from "next/server";
import { listDisputedOrders, resolveOrderIssue, logAdminAction } from "@/lib/repo";
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
    // Money decisions are exactly what an audit trail is for.
    await logAdminAction({
      adminId: admin.id,
      action: body.outcome === "refunded" ? "order.refunded" : "order.payment_released",
      targetType: "order",
      targetId: order.id,
      detail: { item: order.item, seller: order.seller },
    });
    return NextResponse.json({ order });
  } catch (err) {
    return errorResponse(err, "Couldn't resolve that report.");
  }
}
