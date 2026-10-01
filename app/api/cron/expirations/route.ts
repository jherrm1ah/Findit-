import { NextRequest, NextResponse } from "next/server";
import { notifyExpiredBoosts } from "@/lib/boosts";
import { sweepLapsedSubscriptions } from "@/lib/subscriptions";

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
// Both sweeps are the "nothing else would ever trigger this" half of
// boost/subscription expiry — see lib/boosts.ts#notifyExpiredBoosts and
// lib/subscriptions.ts#sweepLapsedSubscriptions for why neither a normal
// page load nor the sort-order logic they ride on needed this before.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const [boostsNotified, subscriptionsResolved] = await Promise.all([
    notifyExpiredBoosts(),
    sweepLapsedSubscriptions(),
  ]);

  return NextResponse.json({ boostsNotified, subscriptionsResolved });
}
