import { NextRequest, NextResponse } from "next/server";
import { notifyExpiredBoosts } from "@/lib/boosts";
import { sweepLapsedSubscriptions } from "@/lib/subscriptions";
import { autoReleaseStaleDeliveries } from "@/lib/repo";
import { initiateSellerPayout } from "@/lib/payments";

// Forced dynamic so Next never tries to statically prerender this at build
// time (same reason app/api/boost-plans/route.ts is) — a GET with no
// request-dependent data otherwise gets collected as a static route, which
// means actually CALLING it (and hitting Supabase) at build time instead of
// on each real cron invocation.
export const dynamic = "force-dynamic";

// Vercel Cron (see vercel.json) hits this on a schedule — there is no
// logged-in session here, same as the Paystack webhook. When CRON_SECRET is
// set, Vercel signs every cron-triggered request with it as a bearer token
// (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs);
// checking it here is what stops anyone else from triggering a sweep (and
// the notifications it sends) on demand. Left unset in local/dev, where
// there's nothing to protect and no Vercel Cron to receive it from anyway.
//
// All three sweeps are the "nothing else would ever trigger this" half of
// their own feature — see lib/boosts.ts#notifyExpiredBoosts,
// lib/subscriptions.ts#sweepLapsedSubscriptions, and
// lib/repo.ts#autoReleaseStaleDeliveries for why neither a normal page
// load nor the logic those features otherwise ride on needed this before.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const [boostsNotified, subscriptionsResolved, releasedOrders] = await Promise.all([
    notifyExpiredBoosts(),
    sweepLapsedSubscriptions(),
    autoReleaseStaleDeliveries(),
  ]);

  // Payout initiation stays separate from the release itself — same
  // reasoning as app/api/orders/[id]/confirm: the release already
  // committed and must not be undone by a slow/failed Paystack call, which
  // records its own outcome on the payouts ledger either way. Awaited
  // here (unlike that route) since there's no client response to keep
  // fast — this run already has every released order in hand, so it's the
  // one place that can trigger them all without a second sweep.
  for (const order of releasedOrders) {
    try {
      await initiateSellerPayout(order);
    } catch (err) {
      console.error("[cron/expirations] payout initiation failed for auto-released order", order.id, err);
    }
  }

  return NextResponse.json({
    boostsNotified,
    subscriptionsResolved,
    autoReleasedOrders: releasedOrders.map((o) => o.id),
  });
}
