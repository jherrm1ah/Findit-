import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { listPayoutsForAdmin } from "@/lib/payments";
import { errorResponse } from "@/lib/errors";

// Admin-only (finance domain): the real seller-payout ledger — see
// lib/payments.ts#initiateSellerPayout for how each row got here (a real
// Paystack Transfer, or an honestly-labeled 'manual_required' row).
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req, "finance");
  if (admin instanceof NextResponse) return admin;

  const status = req.nextUrl.searchParams.get("status") ?? undefined;
  try {
    return NextResponse.json({ payouts: await listPayoutsForAdmin(status) });
  } catch (err) {
    return errorResponse(err, "Couldn't load payouts.");
  }
}
