import { NextResponse } from "next/server";
import { listAdCampaignPlans } from "@/lib/adCampaigns";
import { errorResponse } from "@/lib/errors";

// Public/seller-facing — real pricing (lib/adCampaigns.ts), not hard-coded
// in the client, so an admin can change it without a deploy. Same reasoning
// as /api/boost-plans.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ plans: await listAdCampaignPlans() });
  } catch (err) {
    return errorResponse(err, "Couldn't load ad campaign pricing.");
  }
}
