import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { updatePlan } from "@/lib/subscriptions";
import { logAdminAction } from "@/lib/repo";
import { errorResponse } from "@/lib/errors";

// Admin-only (finance domain). Edits ONE plan's price/limits/features — the
// whole point of storing plans as data: "₦2,000 -> ₦2,500" is a PATCH here,
// not a code change or a deploy. Existing subscriptions keep whatever
// plan_id they already reference, so a price change applies going forward
// without silently altering what anyone already paid for this period.
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
    const plan = await updatePlan(params.id, body);
    await logAdminAction({
      adminId: admin.id,
      action: "subscription_plan_updated",
      targetType: "subscription_plan",
      targetId: params.id,
      detail: body,
    });
    return NextResponse.json({ plan });
  } catch (err) {
    return errorResponse(err, "Couldn't update that plan.");
  }
}
