import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { updateBoostPlan } from "@/lib/boosts";
import { logAdminAction } from "@/lib/repo";
import { errorResponse } from "@/lib/errors";

// Admin-only (finance domain). Edits one boost plan's price/duration/
// features — "₦1,000 for 3 days" -> "₦1,200 for 3 days" is a PATCH here,
// never a deploy. A boost already purchased keeps whatever ends_at it was
// actually given (see lib/boosts.ts#activateBoost) — this only changes
// what a NEW purchase costs going forward.
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
    const plan = await updateBoostPlan(params.id, body);
    await logAdminAction({
      adminId: admin.id,
      action: "boost_plan_updated",
      targetType: "boost_plan",
      targetId: params.id,
      detail: body,
    });
    return NextResponse.json({ plan });
  } catch (err) {
    return errorResponse(err, "Couldn't update that boost plan.");
  }
}
