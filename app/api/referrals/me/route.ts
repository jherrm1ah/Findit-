import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getReferralDashboard } from "@/lib/referrals";
import { errorResponse } from "@/lib/errors";

// A user's own referral dashboard — code, link, counts, rewards. Scoped
// entirely to the signed-in user's own id; there is no way to pass in
// someone else's. See lib/referrals.ts#getReferralDashboard for how each
// number is computed from real rows, never estimated.
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  try {
    return NextResponse.json(await getReferralDashboard(user.id));
  } catch (err) {
    return errorResponse(err, "Couldn't load your referral dashboard.");
  }
}
