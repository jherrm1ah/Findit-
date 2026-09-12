import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature, verifyTransaction } from "@/lib/paystack";
import { getDb, assertNoError } from "@/lib/db";
import { changeStorePlan, changePlatformSubscription, markSubscriptionPastDue, BillingPeriod } from "@/lib/subscriptions";
import { confirmOrderPayment } from "@/lib/payments";
import { activateBoost } from "@/lib/boosts";

type Row = Record<string, unknown>;

// Paystack calls this — never a logged-in browser, so there is no session
// here. The x-paystack-signature check below (HMAC of the raw body against
// OUR secret key) is what stands in for auth: anyone who can produce a
// valid signature already has the secret key, i.e. already IS Paystack (or
// us). Never trust this endpoint's body without that check passing first.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");
  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { event?: string; data?: { reference?: string; status?: string } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const reference = event.data?.reference;
  if (!reference) {
    return NextResponse.json({ received: true });
  }

  const db = getDb();
  const paymentResult = await db
    .from("payments")
    .select("id, status, amount, metadata, subscription_id, order_id, kind")
    .eq("provider_reference", reference)
    .maybeSingle();
  const payment = assertNoError(paymentResult, "loading payment") as Row | null;
  if (!payment) {
    // A reference we never created a pending payment row for — nothing to
    // reconcile. Ack anyway so Paystack doesn't retry forever.
    return NextResponse.json({ received: true });
  }
  if (payment.status === "success") {
    return NextResponse.json({ received: true }); // already processed — webhooks can be delivered more than once
  }

  if (event.event === "charge.success") {
    // The signature proves the request came from Paystack; calling verify
    // (rather than trusting the webhook payload's own amount/status fields)
    // proves the CHARGE actually succeeded for the amount we expect —
    // Paystack's own recommended pattern, and cheap insurance against a
    // malformed or stale event.
    const verified = await verifyTransaction(reference);
    if (verified.status !== "success" || verified.amountNaira !== (payment.amount as number)) {
      await db.from("payments").update({ status: "failed" }).eq("id", payment.id as string);
      return NextResponse.json({ received: true });
    }

    // Conditional on the row still not being 'success' — Paystack can (and
    // does) redeliver the same webhook, and two deliveries arriving close
    // together would otherwise both pass the `payment.status === "success"`
    // check above (both read it before either writes) and both apply the
    // plan change. Only the delivery that actually flips the row proceeds.
    const claimResult = await db
      .from("payments")
      .update({ status: "success", paid_at: verified.paidAt ?? new Date().toISOString() })
      .eq("id", payment.id as string)
      .neq("status", "success")
      .select("id")
      .maybeSingle();
    const claimed = assertNoError(claimResult, "recording successful payment") as Row | null;
    if (!claimed) {
      return NextResponse.json({ received: true }); // a concurrent delivery already processed this one
    }

    if (payment.order_id) {
      try {
        await confirmOrderPayment(payment.order_id as string);
      } catch (err) {
        console.error("[paystack-webhook] payment succeeded but order confirmation failed", err);
      }
    } else if (payment.kind === "boost") {
      const metadata = (payment.metadata as { productId?: string; sellerId?: string; boostPlanId?: string } | null) ?? null;
      if (metadata?.productId && metadata.sellerId && metadata.boostPlanId) {
        try {
          await activateBoost({
            productId: metadata.productId,
            sellerId: metadata.sellerId,
            boostPlanId: metadata.boostPlanId,
            amount: payment.amount as number,
          });
        } catch (err) {
          console.error("[paystack-webhook] payment succeeded but boost activation failed", err);
        }
      }
    } else {
      const metadata = (payment.metadata as {
        sellerId?: string;
        userId?: string;
        planId?: string;
        billingPeriod?: BillingPeriod;
        ownerType?: "platform";
      } | null) ?? null;
      if (metadata?.ownerType === "platform" && metadata.userId && metadata.planId) {
        try {
          await changePlatformSubscription(metadata.userId, metadata.planId, metadata.billingPeriod ?? "monthly", {
            paymentConfirmed: true,
          });
        } catch (err) {
          console.error("[paystack-webhook] payment succeeded but FindIt Pro subscription failed", err);
        }
      } else if (metadata?.sellerId && metadata.planId) {
        try {
          await changeStorePlan(metadata.sellerId, metadata.planId, metadata.billingPeriod ?? "monthly", {
            paymentConfirmed: true,
          });
        } catch (err) {
          console.error("[paystack-webhook] payment succeeded but plan change failed", err);
        }
      }
    }
  } else if (event.event === "charge.failed") {
    await db.from("payments").update({ status: "failed" }).eq("id", payment.id as string);
    if (payment.subscription_id) {
      await markSubscriptionPastDue(payment.subscription_id as string);
    }
    if (payment.order_id) {
      await db.from("orders").update({ payment_status: "failed" }).eq("id", payment.order_id as string);
    }
  }

  return NextResponse.json({ received: true });
}
