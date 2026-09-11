import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listPendingVerifications } from "@/lib/sellerVerification";
import { errorResponse } from "@/lib/errors";

// Admin-only queue of open seller verification submissions (pending or
// needs_info) — evidence URLs are short-lived signed URLs generated fresh
// on every request, never stored or cached as plain public links.
export async function GET(req: NextRequest) {
  const admin = await getSessionUser(req);
  if (admin?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  try {
    return NextResponse.json({ submissions: await listPendingVerifications() });
  } catch (err) {
    return errorResponse(err, "Couldn't load seller verification submissions.");
  }
}
