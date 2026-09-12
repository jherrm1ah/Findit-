import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { listAllBoostPlansForAdmin } from "@/lib/boosts";
import { errorResponse } from "@/lib/errors";

// Admin-only (finance domain — same domain as Store/FindIt Pro plan
// editing). Includes inactive plans; the seller-facing listBoostPlans() at
// GET /api/boost-plans deliberately excludes those.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req, "finance");
  if (admin instanceof NextResponse) return admin;
  try {
    return NextResponse.json({ plans: await listAllBoostPlansForAdmin() });
  } catch (err) {
    return errorResponse(err, "Couldn't load boost plans.");
  }
}
