import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import {
  getPlatformPlanOverview,
  changePlatformSubscription,
  previewPlatformPlanChange,
  cancelPlatformSubscription,
  getPlan,
  BillingPeriod,
} from "@/lib/subscriptions";
import { getDb, assertNoError } from "@/lib/db";
import { isPaystackConfigured, initializeTransaction } from "@/lib/paystack";
import { checkRateLimit } from "@/lib/rateLimit";

const MAX_CHECKOUT_ATTEMPTS = 10;
const CHECKOUT_WINDOW_MS = 60 * 60 * 1000;
const PENDING_PAYMENT_STALE_MS = 15 * 60 * 1000;

// FindIt Pro is account-wide — any signed-in user (buyer or seller) can
// subscribe, unlike Store plans which only exist for sellers. Same
// GET/POST/DELETE shape as app/api/sellers/me/subscription/route.ts.
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  try {
    return NextResponse.json(await getPlatformPlanOverview(user.id));
  } catch (err) {
    return errorResponse(err, "Couldn't load FindIt Pro.");
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  let body: { planId?: string; billingPeriod?: BillingPeriod };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.planId || (body.billingPeriod && body.billingPeriod !== "monthly" && body.billingPeriod !== "yearly")) {
    return NextResponse.json({ error: "planId is required." }, { status: 400 });
  }
  const billingPeriod: BillingPeriod = body.billingPeriod ?? "monthly";

  const { allowed, retryAfterSeconds } = checkRateLimit(`pro-checkout:${user.id}`, MAX_CHECKOUT_ATTEMPTS, CHECKOUT_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many checkout attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  try {
    const plan = await getPlan(body.planId);
    if (!plan || plan.kind !== "platform") {
      return NextResponse.json({ error: "That plan isn't available." }, { status: 400 });
    }

    const preview = await previewPlatformPlanChange(user.id, plan.id, billingPeriod);
    if (preview.outcome === "noop") {
      return NextResponse.json({ error: `You're already subscribed to ${plan.name}.` }, { status: 400 });
    }
    if (preview.outcome === "free" || preview.outcome === "trial") {
      const subscription = await changePlatformSubscription(user.id, plan.id, billingPeriod);
      return NextResponse.json({ applied: true, subscription });
    }

    // preview.outcome === "payment_required"
    const amount = preview.amount;

    if (!isPaystackConfigured()) {
      return NextResponse.json({
        applied: false,
        paymentRequired: true,
        configured: false,
        amount,
        message:
          "Payments aren't set up in this environment yet. An admin can grant this manually, or add Paystack keys to enable checkout.",
      });
    }

    const db = getDb();
    const recentPendingResult = await db
      .from("payments")
      .select("id, created_at")
      .eq("user_id", user.id)
      .eq("kind", "subscription")
      .eq("status", "pending")
      .contains("metadata", { userId: user.id, planId: plan.id, ownerType: "platform" })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const recentPending = assertNoError(recentPendingResult, "checking for a pending payment") as { created_at: string } | null;
    if (recentPending && Date.now() - new Date(recentPending.created_at).getTime() < PENDING_PAYMENT_STALE_MS) {
      return NextResponse.json(
        { error: "You already have a checkout in progress. Finish that payment, or wait a few minutes and try again." },
        { status: 409 }
      );
    }

    const reference = "findit_pro_" + crypto.randomUUID();
    const insertResult = await db.from("payments").insert({
      id: reference,
      user_id: user.id,
      kind: "subscription",
      amount,
      status: "pending",
      provider: "paystack",
      provider_reference: reference,
      metadata: { userId: user.id, planId: plan.id, billingPeriod, ownerType: "platform" },
    });
    assertNoError(insertResult, "recording pending payment");

    // Most accounts have no email (this app is phone-first) — Paystack's
    // initialize endpoint requires one regardless, same fallback used for
    // Store checkout.
    const { authorizationUrl } = await initializeTransaction({
      email: user.email || `${user.phone.replace(/[^0-9]/g, "")}@findit.local`,
      amountNaira: amount,
      reference,
      metadata: { userId: user.id, planId: plan.id, billingPeriod, ownerType: "platform" },
    });

    return NextResponse.json({ applied: false, paymentRequired: true, configured: true, checkoutUrl: authorizationUrl, amount });
  } catch (err) {
    return errorResponse(err, "Couldn't start your FindIt Pro subscription.");
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  try {
    const subscription = await cancelPlatformSubscription(user.id);
    return NextResponse.json({ subscription });
  } catch (err) {
    return errorResponse(err, "Couldn't cancel FindIt Pro.");
  }
}
