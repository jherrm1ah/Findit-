import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { listPendingVerifications } from "@/lib/sellerVerification";
import { errorResponse } from "@/lib/errors";

// Admin-only queue of open seller verification submissions (pending or
// needs_info) — evidence URLs are short-lived signed URLs generated fresh
// on every request, never stored or cached as plain public links.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req, "verification");
  if (admin instanceof NextResponse) return admin;
  try {
    return NextResponse.json({ submissions: await listPendingVerifications() });
  } catch (err) {
    return errorResponse(err, "Couldn't load seller verification submissions.");
  }
}
