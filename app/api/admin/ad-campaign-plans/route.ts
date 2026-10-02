import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { listAllAdCampaignPlansForAdmin } from "@/lib/adCampaigns";
import { errorResponse } from "@/lib/errors";

// Admin-only (finance domain — same domain as Store/boost plan pricing).
// Includes inactive plans; the seller-facing listAdCampaignPlans() at
// GET /api/ad-campaign-plans deliberately excludes those.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req, "finance");
  if (admin instanceof NextResponse) return admin;
  try {
    return NextResponse.json({ plans: await listAllAdCampaignPlansForAdmin() });
  } catch (err) {
    return errorResponse(err, "Couldn't load ad campaign plans.");
  }
}
