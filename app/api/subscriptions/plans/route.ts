import { NextResponse } from "next/server";
import { listPlans } from "@/lib/subscriptions";
import { errorResponse } from "@/lib/errors";

// Public — the pricing/plan-comparison screen needs this before a seller is
// even logged in, and prices/limits live in the database (not hard-coded in
// the client) so an admin can change them without a deploy. This handler
// reads no cookies/headers, so Next.js would otherwise statically prerender
// it at BUILD time and serve that one frozen snapshot forever — silently
// defeating "an admin can change prices without a deploy." Forcing it
// dynamic keeps every request live.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [storePlans, platformPlans] = await Promise.all([listPlans("store"), listPlans("platform")]);
    return NextResponse.json({ storePlans, findItPro: platformPlans[0] ?? null });
  } catch (err) {
    return errorResponse(err, "Couldn't load subscription plans.");
  }
}
