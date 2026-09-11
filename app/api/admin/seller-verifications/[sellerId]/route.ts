import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { adminReviewVerification } from "@/lib/sellerVerification";
import { errorResponse } from "@/lib/errors";

export async function POST(req: NextRequest, { params }: { params: { sellerId: string } }) {
  const admin = await requireAdmin(req, "verification");
  if (admin instanceof NextResponse) return admin;

  let body: { action?: "approved" | "rejected" | "needs_info"; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.action !== "approved" && body.action !== "rejected" && body.action !== "needs_info") {
    return NextResponse.json({ error: "action must be 'approved', 'rejected', or 'needs_info'." }, { status: 400 });
  }

  try {
    await adminReviewVerification(params.sellerId, admin.id, body.action, body.reason?.trim() || null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Couldn't update that seller's verification.");
  }
}
