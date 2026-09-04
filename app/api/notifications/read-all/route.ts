import { NextRequest, NextResponse } from "next/server";
import { markAllNotificationsRead, listNotifications } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to manage your notifications." }, { status: 401 });
  }
  await markAllNotificationsRead(user.id);
  return NextResponse.json({ notifications: await listNotifications(user.id) });
}
