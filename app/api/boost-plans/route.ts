import { NextResponse } from "next/server";
import { listBoostPlans } from "@/lib/boosts";
import { errorResponse } from "@/lib/errors";

// Public/seller-facing — real pricing (lib/boosts.ts), not hard-coded in
// the client, so an admin can change it without a deploy. Forced dynamic
// for the same reason app/api/subscriptions/plans/route.ts is.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ plans: await listBoostPlans() });
  } catch (err) {
    return errorResponse(err, "Couldn't load boost pricing.");
  }
}
