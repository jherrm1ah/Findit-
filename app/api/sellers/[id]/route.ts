import { NextRequest, NextResponse } from "next/server";
import { setSellerStatus, logAdminAction } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getSessionUser(req);
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.status !== "approved" && body.status !== "rejected") {
    return NextResponse.json(
      { error: "status must be 'approved' or 'rejected'" },
      { status: 400 }
    );
  }

  try {
    const seller = await setSellerStatus(params.id, body.status);
    if (!seller) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Best-effort audit trail — who approved/rejected which seller, and
    // when. Never blocks the action itself if logging fails.
    await logAdminAction({
      adminId: user.id,
      action: `seller.${body.status}`,
      targetType: "seller",
      targetId: params.id,
      detail: { sellerName: seller.name },
    });
    return NextResponse.json({ seller });
  } catch (err) {
    return errorResponse(err, "Couldn't update that seller.");
  }
}
