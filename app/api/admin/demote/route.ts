import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, demoteFromAdmin } from "@/lib/auth";
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
    const demoted = await demoteFromAdmin(admin.id, body.phone);
    await logAdminAction({
      adminId: admin.id,
      action: "user.demoted_admin",
      targetType: "user",
      targetId: demoted.id,
      detail: { name: demoted.name },
    });
    await notifyBestEffort({
      userId: demoted.id,
      type: "admin",
      title: "Your admin access was removed",
      body: "You no longer have access to the Admin queue.",
    });
    return NextResponse.json({ user: demoted });
  } catch (err) {
    return errorResponse(err, "Couldn't remove that account's admin access.");
  }
}
