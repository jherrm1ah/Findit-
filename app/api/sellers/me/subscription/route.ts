import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, User } from "@/lib/auth";
import { getSellerIdForUser } from "@/lib/repo";
import { errorResponse } from "@/lib/errors";
import {
  getStorePlanOverview,
  changeStorePlan,
  previewStorePlanChange,
  cancelStoreSubscription,
  getPlan,
  BillingPeriod,
} from "@/lib/subscriptions";
import { getDb, assertNoError } from "@/lib/db";
import { isPaystackConfigured, initializeTransaction } from "@/lib/paystack";

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

// The "Store plan" card + usage meter on the seller dashboard, and the plan
// comparison screen, both read from here.
export async function GET(req: NextRequest) {
  const ctx = await requireSellerId(req);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const overview = await getStorePlanOverview(ctx.sellerId);
    return NextResponse.json(overview);
  } catch (err) {
    return errorResponse(err, "Couldn't load your store plan.");
  }
}

// Starts (or completes) a plan change. Three outcomes, all backend-decided —
// the client just shows whichever comes back:
//   - Free, or a plan the seller can still trial: applied immediately.
//   - A paid plan with Paystack configured: returns a checkoutUrl to send
//     the seller to; the subscription only actually changes once
//     /api/payments/paystack/webhook confirms the charge.
//   - A paid plan with no Paystack keys in this environment yet: a clear
//     "not configured" response instead of pretending to charge anyone.
export async function POST(req: NextRequest) {
  const ctx = await requireSellerId(req);
  if (ctx instanceof NextResponse) return ctx;

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

  try {
    const plan = await getPlan(body.planId);
    if (!plan || plan.kind !== "store") {
      return NextResponse.json({ error: "That plan isn't available." }, { status: 400 });
    }

    const preview = await previewStorePlanChange(ctx.sellerId, plan.id, billingPeriod);
    if (preview.outcome === "noop") {
      return NextResponse.json({ error: `You're already on ${plan.name}.` }, { status: 400 });
    }
    if (preview.outcome === "free" || preview.outcome === "trial") {
      const subscription = await changeStorePlan(ctx.sellerId, plan.id, billingPeriod);
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
          "Payments aren't set up in this environment yet. An admin can grant this plan manually, or add Paystack keys to enable checkout.",
      });
    }

    const reference = "findit_sub_" + crypto.randomUUID();
    const db = getDb();
    const insertResult = await db.from("payments").insert({
      id: reference,
      user_id: ctx.user.id,
      kind: "subscription",
      amount,
      status: "pending",
      provider: "paystack",
      provider_reference: reference,
      metadata: { sellerId: ctx.sellerId, planId: plan.id, billingPeriod },
    });
    assertNoError(insertResult, "recording pending payment");

    // This app has no email field anywhere — accounts are phone-only — but
    // Paystack's initialize endpoint requires one. This synthetic address is
    // never sent anything; it exists purely to satisfy that field.
    const { authorizationUrl } = await initializeTransaction({
      email: `${ctx.user.phone.replace(/[^0-9]/g, "")}@findit.local`,
      amountNaira: amount,
      reference,
      metadata: { sellerId: ctx.sellerId, planId: plan.id, billingPeriod },
    });

    return NextResponse.json({ applied: false, paymentRequired: true, configured: true, checkoutUrl: authorizationUrl, amount });
  } catch (err) {
    return errorResponse(err, "Couldn't change your store plan.");
  }
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireSellerId(req);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const subscription = await cancelStoreSubscription(ctx.sellerId);
    return NextResponse.json({ subscription });
  } catch (err) {
    return errorResponse(err, "Couldn't cancel your store plan.");
  }
}
