import { NextRequest, NextResponse } from "next/server";
import { setSellerStatus, logAdminAction } from "@/lib/repo";
import { requireAdmin } from "@/lib/adminRoles";
import { errorResponse } from "@/lib/errors";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireAdmin(req, "moderation");
  if (user instanceof NextResponse) return user;

  let body: { status?: string; reason?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.status !== "approved" && body.status !== "rejected" && body.status !== "suspended") {
    return NextResponse.json(
      { error: "status must be 'approved', 'rejected', or 'suspended'" },
      { status: 400 }
    );
  }

  try {
    const seller = await setSellerStatus(params.id, body.status, body.reason ?? null);
    if (!seller) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Best-effort audit trail — who approved/rejected/suspended which
    // seller, and why. Never blocks the action itself if logging fails.
    await logAdminAction({
      adminId: user.id,
      action: `seller.${body.status}`,
      targetType: "seller",
      targetId: params.id,
      detail: { sellerName: seller.name, reason: body.reason ?? null },
    });
    return NextResponse.json({ seller });
  } catch (err) {
    return errorResponse(err, "Couldn't update that seller.");
  }
}
