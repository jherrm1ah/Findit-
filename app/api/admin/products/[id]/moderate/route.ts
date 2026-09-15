import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { moderateProduct } from "@/lib/productReports";
import { logAdminAction } from "@/lib/repo";
import { errorResponse } from "@/lib/errors";

// An admin's direct decision on a listing — flag it, remove it, or restore
// it — independent of any specific report (see lib/productReports.ts#moderateProduct
// for why this is deliberately separate from resolving a report).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(req, "moderation");
  if (admin instanceof NextResponse) return admin;

  let body: { status?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.status !== "active" && body.status !== "under_review" && body.status !== "removed") {
    return NextResponse.json({ error: "status must be active, under_review, or removed." }, { status: 400 });
  }

  try {
    const product = await moderateProduct(admin.id, params.id, body.status, body.reason ?? null);
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await logAdminAction({
      adminId: admin.id,
      action: "product.moderated",
      targetType: "product",
      targetId: params.id,
      detail: { status: product.moderationStatus, reason: product.moderationReason },
    });
    return NextResponse.json({ product });
  } catch (err) {
    return errorResponse(err, "Couldn't update that listing's moderation status.");
  }
}
