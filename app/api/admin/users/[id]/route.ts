import { NextRequest, NextResponse } from "next/server";
import { suspendUser, reactivateUser } from "@/lib/auth";
import { logAdminAction } from "@/lib/repo";
import { requireAdmin } from "@/lib/adminRoles";
import { errorResponse } from "@/lib/errors";

// Admin-only (users domain): platform-level suspend/reactivate for ANY
// account — buyer, seller, or admin — independent of a seller's own
// approve/reject/suspend status (that's a separate, seller-specific gate,
// see /api/sellers/[id]). Takes effect immediately, not on next login (see
// lib/auth.ts#getUserForToken).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(req, "users");
  if (admin instanceof NextResponse) return admin;

  let body: { suspended?: boolean; reason?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.suspended !== "boolean") {
    return NextResponse.json({ error: "suspended must be true or false" }, { status: 400 });
  }

  try {
    const user = body.suspended
      ? await suspendUser(params.id, body.reason ?? "", admin.id)
      : await reactivateUser(params.id);

    await logAdminAction({
      adminId: admin.id,
      action: body.suspended ? "user.suspended" : "user.reactivated",
      targetType: "user",
      targetId: params.id,
      detail: { name: user.name, reason: body.suspended ? user.suspendedReason : null },
    });

    return NextResponse.json({ user });
  } catch (err) {
    return errorResponse(err, "Couldn't update that account.");
  }
}
