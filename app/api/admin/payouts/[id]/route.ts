import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { markPayoutPaidManually } from "@/lib/payments";
import { logAdminAction } from "@/lib/repo";
import { errorResponse } from "@/lib/errors";

// Admin-only (finance domain) escape hatch: marks a 'manual_required' (or
// previously 'failed') payout as paid after settling it off-platform — the
// same honest pattern as lib/subscriptions.ts#grantStorePlan. Never lets an
// already-'paid' payout be marked paid again.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(req, "finance");
  if (admin instanceof NextResponse) return admin;

  try {
    await markPayoutPaidManually(params.id);
    await logAdminAction({
      adminId: admin.id,
      action: "payout_marked_paid_manually",
      targetType: "payout",
      targetId: params.id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Couldn't mark that payout paid.");
  }
}
