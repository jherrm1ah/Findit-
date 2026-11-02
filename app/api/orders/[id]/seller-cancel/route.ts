import { NextRequest, NextResponse } from "next/server";
import { sellerCancelPaidOrder, getSellerIdForUser, notifyAdminsBestEffort, type SellerCancelReason } from "@/lib/repo";
import { refundOrderPayment } from "@/lib/payments";
import { getSessionUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { getDb, assertNoError } from "@/lib/db";
import { releaseCredit } from "@/lib/referrals";

// "Can't fulfil this order": the seller cancels a paid order they haven't
// dispatched, and FindIt refunds the buyer (lib/repo.ts#sellerCancelPaidOrder).
// The order is marked cancelled and refunded first, so it can't be dispatched
// or paid out in the meantime; then the real Paystack refund. If Paystack
// won't take it, the admins are told so a person refunds the buyer.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser(req);
  if (user?.role !== "seller" || !user.businessName) {
    return NextResponse.json({ error: "Seller access required." }, { status: 403 });
  }
  let reason: SellerCancelReason = "other";
  try {
    const body = await req.json();
    if (typeof body?.reason === "string") reason = body.reason as SellerCancelReason;
  } catch {
    // no body: "other"
  }

  try {
    const order = await sellerCancelPaidOrder(params.id, { id: await getSellerIdForUser(user.id), name: user.businessName }, reason);
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // FindIt credit the buyer used on this order goes back to them; the card
    // part is refunded through Paystack. An order paid entirely with credit
    // has no card charge to refund.
    const paymentsResult = await getDb()
      .from("payments")
      .select("id, provider, amount")
      .eq("order_id", order.id)
      .eq("kind", "order")
      .eq("status", "success");
    const payments = assertNoError(paymentsResult, "loading the order's payments") as { id: string; provider: string; amount: number }[];
    for (const p of payments) await releaseCredit(p.id);
    const needsCardRefund = payments.some((p) => p.provider !== "referral_credit" && p.amount > 0);

    const refund = needsCardRefund ? await refundOrderPayment(order.id) : { refunded: true as boolean, reason: undefined as string | undefined };
    if (!refund.refunded) {
      await notifyAdminsBestEffort(
        "Refund needed",
        `${order.seller} cancelled paid order ${order.id} ("${order.item}", ₦${order.price.toLocaleString("en-NG")}) but the automatic refund didn't go through: ${refund.reason ?? "unknown reason"}. Refund the buyer manually.`
      );
    }
    return NextResponse.json({ order, refunded: refund.refunded });
  } catch (err) {
    return errorResponse(err, "Couldn't cancel that order.");
  }
}
