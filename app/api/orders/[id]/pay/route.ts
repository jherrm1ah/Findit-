import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getOrder } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";
import { getDb, assertNoError } from "@/lib/db";
import { isPaystackConfigured, initializeTransaction } from "@/lib/paystack";
import { checkRateLimit } from "@/lib/rateLimit";
import { errorResponse } from "@/lib/errors";
import { confirmOrderPayment } from "@/lib/payments";
import { getAvailableCredit, reserveCredit, releaseCredit } from "@/lib/referrals";

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

  const { allowed, retryAfterSeconds } = await checkRateLimit(`order-checkout:${user.id}`, MAX_CHECKOUT_ATTEMPTS, CHECKOUT_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many checkout attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  // The only thing trusted from the body: whether the buyer WANTS to apply
  // credit. The amount is never read from here — see getAvailableCredit/
  // reserveCredit below, which compute it server-side from the real ledger.
  let applyCredit = false;
  try {
    const body = await req.json();
    applyCredit = body?.applyCredit === true;
  } catch {
    // No body (or not JSON) is the normal case for a plain "Pay now" with
    // no credit involved — not a request error.
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
    const recentPending = assertNoError(recentPendingResult, "checking for a pending payment") as { id: string; created_at: string } | null;
    if (recentPending && Date.now() - new Date(recentPending.created_at).getTime() < PENDING_PAYMENT_STALE_MS) {
      return NextResponse.json(
        { error: "You already have a checkout in progress for this order. Finish that payment, or wait a few minutes and try again." },
        { status: 409 }
      );
    }
    // A pending attempt old enough to retry past is also old enough to
    // treat as abandoned — release any credit it had reserved (see
    // releaseCredit's own comment) so this new attempt can actually use it,
    // instead of that credit staying locked against a checkout nobody is
    // going to finish.
    if (recentPending) await releaseCredit(recentPending.id as string);

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

    // Reserved against THIS payment row (already inserted above, so the
    // credit-ledger's foreign key has something to point at) before any
    // Paystack call — see reserveCredit's own comment for why eager
    // reservation, not reservation-at-confirmation, is what actually
    // prevents the same naira of credit being spent on two orders at once.
    let creditApplied = 0;
    if (applyCredit) {
      const available = await getAvailableCredit(user.id);
      const desired = Math.min(available, order.price);
      if (desired > 0) creditApplied = await reserveCredit(user.id, order.id, reference, desired);
    }
    const payableAmount = order.price - creditApplied;

    if (payableAmount <= 0) {
      // Fully covered by credit — there is no real charge for Paystack to
      // make, so there's no checkout to start and nothing for the webhook
      // to confirm later. This payments row IS the whole transaction.
      const coveredResult = await db
        .from("payments")
        .update({ amount: 0, status: "success", provider: "referral_credit", paid_at: new Date().toISOString(), metadata: { orderId: order.id, creditApplied } })
        .eq("id", reference);
      assertNoError(coveredResult, "recording a fully credit-covered payment");
      await confirmOrderPayment(order.id, creditApplied);
      return NextResponse.json({ applied: true, paymentRequired: false, configured: true, amount: 0, creditApplied });
    }

    const metadataResult = await db
      .from("payments")
      .update({ amount: payableAmount, metadata: { orderId: order.id, creditApplied } })
      .eq("id", reference);
    assertNoError(metadataResult, "recording the credit-adjusted payment amount");

    let authorizationUrl: string;
    try {
      // Most accounts have no email (this app is phone-first) — Paystack's
      // initialize endpoint requires one regardless, so this synthetic
      // address (never sent anything) is the fallback when the buyer
      // hasn't given us a real one. Must be a real, publicly-valid domain —
      // Paystack's live API rejects ".local" (and similar non-public TLDs)
      // as "not a valid email" even though the format otherwise looks fine.
      ({ authorizationUrl } = await initializeTransaction({
        email: user.email || `${user.phone.replace(/[^0-9]/g, "")}@shopwithfindit.com`,
        amountNaira: payableAmount,
        reference,
        metadata: { orderId: order.id, creditApplied },
      }));
    } catch (err) {
      // initializeTransaction can throw after the pending row above already
      // committed — leaving it "pending" would block every retry for the
      // next PENDING_PAYMENT_STALE_MS (the check above only matches
      // status='pending'), even though this attempt never actually reached
      // Paystack successfully. Mark it failed, and give back any credit
      // this attempt had reserved, so the buyer's very next tap isn't
      // blocked (or short a reward) over an attempt that never got anywhere.
      await db
        .from("payments")
        .update({ status: "failed", metadata: { orderId: order.id, creditApplied, initError: err instanceof Error ? err.message : String(err) } })
        .eq("id", reference);
      if (creditApplied > 0) await releaseCredit(reference);
      throw err;
    }

    return NextResponse.json({ applied: false, paymentRequired: true, configured: true, checkoutUrl: authorizationUrl, amount: payableAmount, creditApplied });
  } catch (err) {
    return errorResponse(err, "Couldn't start payment for that order.");
  }
}
