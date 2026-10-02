import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { takeDownAdCampaign } from "@/lib/adCampaigns";
import { logAdminAction } from "@/lib/repo";
import { errorResponse } from "@/lib/errors";

// Admin-only (moderation domain). The reactive-moderation counterpart to a
// product getting flagged by lib/moderationRules.ts — a campaign goes live
// the moment it's paid for (same as a boost or a new listing), and this is
// how an admin pulls one down afterward, same spirit as suspending a
// listing. Never a refund: see migration 040's note on why this app
// deliberately has no pre-payment approval gate for campaigns.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(req, "moderation");
  if (admin instanceof NextResponse) return admin;

  let body: { reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const campaign = await takeDownAdCampaign(params.id, body.reason?.trim() || null);
    if (!campaign) {
      return NextResponse.json({ error: "Ad campaign not found." }, { status: 404 });
    }
    await logAdminAction({
      adminId: admin.id,
      action: "ad_campaign_taken_down",
      targetType: "ad_campaign",
      targetId: params.id,
      detail: { reason: body.reason ?? null },
    });
    return NextResponse.json({ campaign });
  } catch (err) {
    return errorResponse(err, "Couldn't take down that ad campaign.");
  }
}
