import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, User } from "@/lib/auth";
import { getSellerIdForUser, getProduct } from "@/lib/repo";
import { sellerOwnsItem } from "@/lib/sellerIdentityMatch";
import {
  getAdCampaignPlan,
  validateAdCampaignInput,
  listAdCampaignsForSeller,
} from "@/lib/adCampaigns";
import { getPlatformSubscription, applyProPurchaseDiscount } from "@/lib/subscriptions";
import { getDb, assertNoError } from "@/lib/db";
import { isPaystackConfigured, initializeTransaction } from "@/lib/paystack";
import { checkRateLimit } from "@/lib/rateLimit";
import { errorResponse } from "@/lib/errors";

const MAX_CHECKOUT_ATTEMPTS = 10;
const CHECKOUT_WINDOW_MS = 60 * 60 * 1000;
// Same double-click guard as boost/order/subscription checkout — without
// this, a double-click creates two separate Paystack sessions for the same
// campaign, and paying both would charge the seller twice.
const PENDING_PAYMENT_STALE_MS = 15 * 60 * 1000;

async function requireSellerId(req: NextRequest): Promise<{ user: User; sellerId: string } | NextResponse> {
  const user = await getSessionUser(req);
  if (!user || user.role !== "seller") {
    return NextResponse.json({ error: "Seller access required." }, { status: 403 });
  }
  const sellerId = await getSellerIdForUser(user.id);
  if (!sellerId) {
    return NextResponse.json({ error: "No store found for this account yet." }, { status: 404 });
  }
  return { user, sellerId };
}

// This seller's own campaigns (live and past) — the "Advertise" card's own
// history list.
export async function GET(req: NextRequest) {
  const ctx = await requireSellerId(req);
  if (ctx instanceof NextResponse) return ctx;
  try {
    return NextResponse.json({ campaigns: await listAdCampaignsForSeller(ctx.sellerId) });
  } catch (err) {
    return errorResponse(err, "Couldn't load your ad campaigns.");
  }
}

// Starts a real Paystack checkout for a new ad campaign. Unlike order/
// subscription/boost checkout, there is nothing to look up server-side for
// WHAT this purchase is — a campaign has no row anywhere until the webhook
// confirms payment (see activateAdCampaign) — so the submitted content
// itself rides along as the payment row's metadata, validated here exactly
// as strictly as it will be trusted later. The campaign only actually goes
// live once app/api/payments/paystack/webhook confirms the charge — never
// on this route's own response.
//
// A campaign always promotes one of the seller's own listings — never a
// separately-uploaded banner, and never just the store page. targetProductId
// is required, and its image IS the campaign's image: no imageUrl is ever
// accepted from the client here, closing off the "whatever URL the client
// feels like sending" surface entirely, not just validating it like before.
export async function POST(req: NextRequest) {
  const ctx = await requireSellerId(req);
  if (ctx instanceof NextResponse) return ctx;

  let body: {
    planId?: string;
    headline?: string;
    body?: string;
    ctaLabel?: string;
    targetProductId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.planId) {
    return NextResponse.json({ error: "planId is required." }, { status: 400 });
  }
  if (!body.targetProductId) {
    return NextResponse.json({ error: "Pick a listing to promote." }, { status: 400 });
  }
  const headline = (body.headline ?? "").trim();
  const text = (body.body ?? "").trim();
  const ctaLabel = (body.ctaLabel ?? "").trim() || "Shop now";

  const { allowed, retryAfterSeconds } = await checkRateLimit(`ad-campaign-checkout:${ctx.user.id}`, MAX_CHECKOUT_ATTEMPTS, CHECKOUT_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many checkout attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  try {
    validateAdCampaignInput({ headline, body: text, ctaLabel });

    const product = await getProduct(body.targetProductId);
    if (!product || !sellerOwnsItem(ctx.user.businessName, ctx.sellerId, product.seller, product.sellerId)) {
      return NextResponse.json({ error: "You can only promote your own listing." }, { status: 403 });
    }
    if (!product.imageUrl) {
      return NextResponse.json({ error: "Add a photo to that listing before advertising it." }, { status: 400 });
    }
    const targetProductId = product.id;
    const imageUrl = product.imageUrl;

    const plan = await getAdCampaignPlan(body.planId);
    if (!plan || !plan.active) {
      return NextResponse.json({ error: "That ad campaign plan isn't available." }, { status: 400 });
    }

    // FindIt Pro's own value (see lib/subscriptions.ts#applyProPurchaseDiscount)
    // — 20% off, decided by this seller's Pro status at the moment of
    // purchase, never stored on the plan itself.
    const isFindItPro = Boolean(await getPlatformSubscription(ctx.user.id));
    const amount = applyProPurchaseDiscount(plan.price, isFindItPro);

    if (!isPaystackConfigured()) {
      return NextResponse.json({
        applied: false,
        paymentRequired: true,
        configured: false,
        amount,
        message: "Payments aren't set up in this environment yet — advertising isn't available.",
      });
    }

    const db = getDb();
    const recentPendingResult = await db
      .from("payments")
      .select("id, created_at")
      .eq("user_id", ctx.user.id)
      .eq("kind", "ad_campaign")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const recentPending = assertNoError(recentPendingResult, "checking for a pending payment") as { created_at: string } | null;
    if (recentPending && Date.now() - new Date(recentPending.created_at).getTime() < PENDING_PAYMENT_STALE_MS) {
      return NextResponse.json(
        { error: "You already have an ad campaign checkout in progress. Finish that payment, or wait a few minutes and try again." },
        { status: 409 }
      );
    }

    const metadata = {
      sellerId: ctx.sellerId,
      planId: plan.id,
      headline,
      body: text,
      ctaLabel,
      imageUrl,
      targetProductId,
    };

    const reference = "findit_adcamp_" + crypto.randomUUID();
    const insertResult = await db.from("payments").insert({
      id: reference,
      user_id: ctx.user.id,
      kind: "ad_campaign",
      amount,
      status: "pending",
      provider: "paystack",
      provider_reference: reference,
      metadata,
    });
    assertNoError(insertResult, "recording pending payment");

    let authorizationUrl: string;
    try {
      ({ authorizationUrl } = await initializeTransaction({
        email: ctx.user.email || `${ctx.user.phone.replace(/[^0-9]/g, "")}@shopwithfindit.com`,
        amountNaira: amount,
        reference,
        metadata,
      }));
    } catch (err) {
      // Same reasoning as the boost/order/subscription checkout routes: a
      // pending row left behind by a failed init call would otherwise block
      // the seller's next retry for PENDING_PAYMENT_STALE_MS.
      await db
        .from("payments")
        .update({ status: "failed", metadata: { ...metadata, initError: err instanceof Error ? err.message : String(err) } })
        .eq("id", reference);
      throw err;
    }

    return NextResponse.json({ applied: false, paymentRequired: true, configured: true, checkoutUrl: authorizationUrl, amount });
  } catch (err) {
    return errorResponse(err, "Couldn't start payment for that ad campaign.");
  }
}
