import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { updateAdCampaignPlan } from "@/lib/adCampaigns";
import { logAdminAction } from "@/lib/repo";
import { errorResponse } from "@/lib/errors";

// Admin-only (finance domain). Edits one ad campaign plan's price/duration —
// a PATCH here, never a deploy. A campaign already purchased keeps whatever
// ends_at it was actually given (see lib/adCampaigns.ts#activateAdCampaign) —
// this only changes what a NEW purchase costs going forward.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(req, "finance");
  if (admin instanceof NextResponse) return admin;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const plan = await updateAdCampaignPlan(params.id, body);
    await logAdminAction({
      adminId: admin.id,
      action: "ad_campaign_plan_updated",
      targetType: "ad_campaign_plan",
      targetId: params.id,
      detail: body,
    });
    return NextResponse.json({ plan });
  } catch (err) {
    return errorResponse(err, "Couldn't update that ad campaign plan.");
  }
}
