import { NextResponse } from "next/server";
import { listActiveAdCampaigns } from "@/lib/adCampaigns";
import { errorResponse } from "@/lib/errors";

// Public — every buyer's Home screen fetches this to fill the promo
// carousel's Sponsored slides, alongside the app's own always-first
// Request-first slide (which stays hardcoded client-side; see Home.jsx —
// it is not an advertisement and has no row in this table at all). Forced
// dynamic for the same reason /api/boost-plans is: real, currently-active
// rows, never a build-time snapshot.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ campaigns: await listActiveAdCampaigns() });
  } catch (err) {
    return errorResponse(err, "Couldn't load ad campaigns.");
  }
}
