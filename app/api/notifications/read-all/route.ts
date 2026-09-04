import { NextRequest, NextResponse } from "next/server";
import { markAllNotificationsRead, listNotifications } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  markAllNotificationsRead(user?.id);
  return NextResponse.json({ notifications: listNotifications(user?.id) });
}
