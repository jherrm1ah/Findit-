import { NextRequest, NextResponse } from "next/server";
import { listAdminActions } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";

// Admin-only audit trail — who did what admin action, to what, and when.
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  return NextResponse.json({ actions: await listAdminActions() });
}
