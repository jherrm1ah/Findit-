import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listAllPlansForAdmin } from "@/lib/subscriptions";
import { errorResponse } from "@/lib/errors";

// Admin-only: every plan (including inactive ones), for a future plan-editor
// screen — prices/limits live here as data specifically so this doesn't
// require touching frontend code. See lib/subscriptions.ts#updatePlan for
// the PATCH half, at /api/admin/subscription-plans/[id].
export async function GET(req: NextRequest) {
  const admin = await getSessionUser(req);
  if (admin?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  try {
    return NextResponse.json({ plans: await listAllPlansForAdmin() });
  } catch (err) {
    return errorResponse(err, "Couldn't load subscription plans.");
  }
}
