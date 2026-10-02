import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { listAllAdCampaignsForAdmin } from "@/lib/adCampaigns";
import { errorResponse } from "@/lib/errors";

// Admin-only (moderation domain — same domain as product reports). Every
// campaign ever purchased, most recent first, for reviewing what's
// currently live in the home carousel and taking one down if needed. See
// app/api/admin/ad-campaigns/[id] for the takedown action itself.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req, "moderation");
  if (admin instanceof NextResponse) return admin;
  try {
    return NextResponse.json({ campaigns: await listAllAdCampaignsForAdmin() });
  } catch (err) {
    return errorResponse(err, "Couldn't load ad campaigns.");
  }
}
