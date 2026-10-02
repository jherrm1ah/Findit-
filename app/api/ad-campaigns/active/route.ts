import { NextResponse } from "next/server";
import { pickAdCampaignForImpression } from "@/lib/adCampaigns";
import { errorResponse } from "@/lib/errors";

// Public — every buyer's Home screen fetches this to fill the promo
// carousel's one Sponsored slide, alongside the app's own always-first
// Request-first slide (which stays hardcoded client-side; see Home.jsx —
// it is not an advertisement and has no row in this table at all).
//
// Returns at most ONE campaign, not every active one — see
// lib/adCampaigns.ts#pickAdCampaignForImpression for why: the home screen
// is scarce inventory (one slide), not ranked placement like Boost, so
// this call itself IS the rotation — each hit picks a campaign and counts
// it as a real impression. Forced dynamic for the same reason
// /api/boost-plans is: a live pick, never a build-time snapshot.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ campaign: await pickAdCampaignForImpression() });
  } catch (err) {
    return errorResponse(err, "Couldn't load an ad campaign.");
  }
}
