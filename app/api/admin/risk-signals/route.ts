import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { getSellerRiskSignals } from "@/lib/risk";
import { errorResponse } from "@/lib/errors";

// Admin-only (moderation domain — same domain as reported problems/
// disputes). Real, computed-from-actual-orders signals — never a
// fabricated fraud score. See lib/risk.ts for exactly what "risk" means
// here and why a seller needs a minimum order count before showing up.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req, "moderation");
  if (admin instanceof NextResponse) return admin;
  try {
    return NextResponse.json({ signals: await getSellerRiskSignals() });
  } catch (err) {
    return errorResponse(err, "Couldn't load risk signals.");
  }
}
