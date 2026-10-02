import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { retrySellerPayout } from "@/lib/payments";
import { logAdminAction } from "@/lib/repo";
import { errorResponse } from "@/lib/errors";

// Admin-only (finance domain) re-attempt of a 'manual_required' or 'failed'
// payout — e.g. the seller had no bank account on file when the original
// attempt ran and has since added one. Same honest pattern as the
// neighboring [id]/route.ts mark-paid endpoint: this makes a real Paystack
// Transfer call, it doesn't just flip a status.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(req, "finance");
  if (admin instanceof NextResponse) return admin;

  try {
    await retrySellerPayout(params.id);
    await logAdminAction({
      adminId: admin.id,
      action: "payout_retried",
      targetType: "payout",
      targetId: params.id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Couldn't retry that payout.");
  }
}
