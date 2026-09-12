import { NextRequest, NextResponse } from "next/server";
import { promoteToAdmin } from "@/lib/auth";
import { requireSuperAdmin, ADMIN_ROLES, AdminRole } from "@/lib/adminRoles";
import { logAdminAction, notifyBestEffort } from "@/lib/repo";
import { errorResponse } from "@/lib/errors";

// Creating a new admin is categorically more sensitive than any single
// permission domain, so this is super_admin-only, not just "any admin" —
// see the AdminPermission comment in lib/adminRoles.ts.
export async function POST(req: NextRequest) {
  const admin = await requireSuperAdmin(req);
  if (admin instanceof NextResponse) return admin;

  let body: { phone?: string; adminRole?: AdminRole };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.phone) {
    return NextResponse.json({ error: "Enter a phone number." }, { status: 400 });
  }
  if (body.adminRole && !ADMIN_ROLES.some((r) => r.value === body.adminRole)) {
    return NextResponse.json({ error: "Unknown admin role." }, { status: 400 });
  }

  try {
    const promoted = await promoteToAdmin(body.phone, body.adminRole);
    // Best-effort audit trail — who promoted whom, and when. Never blocks
    // the promotion itself if logging fails.
    await logAdminAction({
      adminId: admin.id,
      action: "user.promoted_admin",
      targetType: "user",
      targetId: promoted.id,
      detail: { name: promoted.name, adminRole: promoted.adminRole },
    });
    // Let the promoted account know — otherwise the only way they'd find
    // out is stumbling onto the Admin queue tab next time they open the
    // app. notifyBestEffort already handles failures gracefully and skips
    // the write if this user has notifications turned off.
    await notifyBestEffort({
      userId: promoted.id,
      type: "admin",
      title: "You're now a FindIt admin",
      body: "You've been granted admin access — you can verify sellers and review unmatched requests from the Admin queue.",
    });
    return NextResponse.json({ user: promoted });
  } catch (err) {
    return errorResponse(err, "Couldn't promote that account.");
  }
}
