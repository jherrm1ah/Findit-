import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getOrder } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";
import { getDb, assertNoError } from "@/lib/db";
import { isPaystackConfigured, initializeTransaction } from "@/lib/paystack";
import { checkRateLimit } from "@/lib/rateLimit";
import { errorResponse } from "@/lib/errors";

const MAX_CHECKOUT_ATTEMPTS = 10;
const CHECKOUT_WINDOW_MS = 60 * 60 * 1000;
// Same reasoning as the store-subscription checkout guard: without this, a
// double-click on "Pay now" would create two separate Paystack checkout
// sessions for the same order, and paying both would charge the buyer
// twice for one order.
const PENDING_PAYMENT_STALE_MS = 15 * 60 * 1000;

// Starts (or completes, for the "not configured" case) payment for a real
// marketplace order. The amount is ALWAYS the order's own server-recorded
// price — never anything the client sends — and the order only ever
// actually becomes paid once app/api/payments/paystack/webhook confirms
// the real charge, never from this route's own response.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to pay for this order." }, { status: 401 });
  }

  const order = await getOrder(params.id);
  if (!order || order.userId !== user.id) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }
  if (order.paymentStatus === "paid") {
    return NextResponse.json({ error: "This order has already been paid for." }, { status: 400 });
  }

  const { allowed, retryAfterSeconds } = checkRateLimit(`order-checkout:${user.id}`, MAX_CHECKOUT_ATTEMPTS, CHECKOUT_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many checkout attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  try {
    if (!isPaystackConfigured()) {
      return NextResponse.json({
        applied: false,
        paymentRequired: true,
        configured: false,
        amount: order.price,
        message: "Payments aren't set up in this environment yet — contact the seller directly to arrange payment.",
      });
    }

    const db = getDb();
    const recentPendingResult = await db
      .from("payments")
      .select("id, created_at")
      .eq("order_id", order.id)
      .eq("kind", "order")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const recentPending = assertNoError(recentPendingResult, "checking for a pending payment") as { created_at: string } | null;
    if (recentPending && Date.now() - new Date(recentPending.created_at).getTime() < PENDING_PAYMENT_STALE_MS) {
      return NextResponse.json(
        { error: "You already have a checkout in progress for this order. Finish that payment, or wait a few minutes and try again." },
        { status: 409 }
      );
    }

    const reference = "findit_ord_" + crypto.randomUUID();
    const insertResult = await db.from("payments").insert({
      id: reference,
      user_id: user.id,
      order_id: order.id,
      kind: "order",
      amount: order.price,
      status: "pending",
      provider: "paystack",
      provider_reference: reference,
      metadata: { orderId: order.id },
    });
    assertNoError(insertResult, "recording pending payment");

    // Most accounts have no email (this app is phone-first) — Paystack's
    // initialize endpoint requires one regardless, so this synthetic
    // address (never sent anything) is the fallback when the buyer hasn't
    // given us a real one.
    const { authorizationUrl } = await initializeTransaction({
      email: user.email || `${user.phone.replace(/[^0-9]/g, "")}@findit.local`,
      amountNaira: order.price,
      reference,
      metadata: { orderId: order.id },
    });

    return NextResponse.json({ applied: false, paymentRequired: true, configured: true, checkoutUrl: authorizationUrl, amount: order.price });
  } catch (err) {
    return errorResponse(err, "Couldn't start payment for that order.");
  }
}
