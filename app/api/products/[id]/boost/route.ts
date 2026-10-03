import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getProduct, getSellerIdForUser } from "@/lib/repo";
import { sellerOwnsItem } from "@/lib/sellerIdentityMatch";
import { getSessionUser } from "@/lib/auth";
import { getBoostPlan } from "@/lib/boosts";
import { getPlatformSubscription, applyProPurchaseDiscount } from "@/lib/subscriptions";
import { getDb, assertNoError } from "@/lib/db";
import { isPaystackConfigured, initializeTransaction } from "@/lib/paystack";
import { checkRateLimit } from "@/lib/rateLimit";
import { errorResponse } from "@/lib/errors";

const MAX_CHECKOUT_ATTEMPTS = 10;
const CHECKOUT_WINDOW_MS = 60 * 60 * 1000;
// Same double-click guard as order/subscription checkout — without this, a
// double-click would create two separate Paystack sessions for the same
// boost, and paying both would charge the seller twice.
const PENDING_PAYMENT_STALE_MS = 15 * 60 * 1000;

// Starts (or reports "not configured" for) a real Paystack checkout to
// promote one of the seller's own listings. The listing only actually gets
// boosted once app/api/payments/paystack/webhook confirms the charge and
// calls lib/boosts.ts#activateBoost — never on this route's own response.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser(req);
  if (!user || user.role !== "seller") {
    return NextResponse.json({ error: "Seller access required." }, { status: 403 });
  }

  const product = await getProduct(params.id);
  if (!product) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }
  const sellerId = await getSellerIdForUser(user.id);
  if (!sellerOwnsItem(user.businessName, sellerId, product.seller, product.sellerId)) {
    return NextResponse.json({ error: "Only the seller who owns this listing can boost it." }, { status: 403 });
  }
  if (!product.active) {
    return NextResponse.json({ error: "Reactivate this listing before boosting it." }, { status: 400 });
  }
  if (!sellerId) {
    return NextResponse.json({ error: "Couldn't resolve your store account for this listing." }, { status: 400 });
  }

  let body: { boostPlanId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.boostPlanId) {
    return NextResponse.json({ error: "boostPlanId is required." }, { status: 400 });
  }

  const { allowed, retryAfterSeconds } = await checkRateLimit(`boost-checkout:${user.id}`, MAX_CHECKOUT_ATTEMPTS, CHECKOUT_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many checkout attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  try {
    const plan = await getBoostPlan(body.boostPlanId);
    if (!plan || !plan.active) {
      return NextResponse.json({ error: "That boost plan isn't available." }, { status: 400 });
    }

    // FindIt Pro's own value (see lib/subscriptions.ts#applyProPurchaseDiscount)
    // — 20% off, decided by this seller's Pro status at the moment of
    // purchase, never stored on the plan itself.
    const isFindItPro = Boolean(await getPlatformSubscription(user.id));
    const amount = applyProPurchaseDiscount(plan.price, isFindItPro);

    if (!isPaystackConfigured()) {
      return NextResponse.json({
        applied: false,
        paymentRequired: true,
        configured: false,
        amount,
        message: "Payments aren't set up in this environment yet — boosting isn't available.",
      });
    }

    const db = getDb();
    const recentPendingResult = await db
      .from("payments")
      .select("id, created_at")
      .eq("user_id", user.id)
      .eq("kind", "boost")
      .eq("status", "pending")
      .contains("metadata", { productId: product.id })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const recentPending = assertNoError(recentPendingResult, "checking for a pending payment") as { created_at: string } | null;
    if (recentPending && Date.now() - new Date(recentPending.created_at).getTime() < PENDING_PAYMENT_STALE_MS) {
      return NextResponse.json(
        { error: "You already have a boost checkout in progress for this listing. Finish that payment, or wait a few minutes and try again." },
        { status: 409 }
      );
    }

    const reference = "findit_boost_" + crypto.randomUUID();
    const insertResult = await db.from("payments").insert({
      id: reference,
      user_id: user.id,
      kind: "boost",
      amount,
      status: "pending",
      provider: "paystack",
      provider_reference: reference,
      metadata: { productId: product.id, sellerId, boostPlanId: plan.id },
    });
    assertNoError(insertResult, "recording pending payment");

    let authorizationUrl: string;
    try {
      // Must be a real, publicly-valid domain — Paystack's live API rejects
      // ".local" (and similar non-public TLDs) as "not a valid email" even
      // though the format otherwise looks fine.
      ({ authorizationUrl } = await initializeTransaction({
        email: user.email || `${user.phone.replace(/[^0-9]/g, "")}@shopwithfindit.com`,
        amountNaira: amount,
        reference,
        metadata: { productId: product.id, sellerId, boostPlanId: plan.id },
      }));
    } catch (err) {
      // Same reasoning as the order/subscription checkout routes: a
      // pending row left behind by a failed init call would otherwise
      // block the seller's next retry for PENDING_PAYMENT_STALE_MS.
      await db
        .from("payments")
        .update({
          status: "failed",
          metadata: { productId: product.id, sellerId, boostPlanId: plan.id, initError: err instanceof Error ? err.message : String(err) },
        })
        .eq("id", reference);
      throw err;
    }

    return NextResponse.json({ applied: false, paymentRequired: true, configured: true, checkoutUrl: authorizationUrl, amount });
  } catch (err) {
    return errorResponse(err, "Couldn't start payment for that boost.");
  }
}
