import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { listAllPlansForAdmin } from "@/lib/subscriptions";
import { errorResponse } from "@/lib/errors";

// Admin-only (finance domain): every plan (including inactive ones), for
// the plan-editor screen — prices/limits live here as data specifically so
// this doesn't require touching frontend code. See
// lib/subscriptions.ts#updatePlan for the PATCH half, at
// /api/admin/subscription-plans/[id].
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req, "finance");
  if (admin instanceof NextResponse) return admin;
  try {
    return NextResponse.json({ plans: await listAllPlansForAdmin() });
  } catch (err) {
    return errorResponse(err, "Couldn't load subscription plans.");
  }
}
