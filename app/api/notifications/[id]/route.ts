import { NextRequest, NextResponse } from "next/server";
import { markNotificationRead } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to manage your notifications." }, { status: 401 });
  }
  const notification = await markNotificationRead(params.id, user.id);
  if (!notification) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ notification });
}
