import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, promoteToAdmin } from "@/lib/auth";
import { logAdminAction, notifyBestEffort } from "@/lib/repo";
import { errorResponse } from "@/lib/errors";

export async function POST(req: NextRequest) {
  const admin = await getSessionUser(req);
  if (admin?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.phone) {
    return NextResponse.json({ error: "Enter a phone number." }, { status: 400 });
  }

  try {
    const promoted = await promoteToAdmin(body.phone);
    // Best-effort audit trail — who promoted whom, and when. Never blocks
    // the promotion itself if logging fails.
    await logAdminAction({
      adminId: admin.id,
      action: "user.promoted_admin",
      targetType: "user",
      targetId: promoted.id,
      detail: { name: promoted.name },
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
