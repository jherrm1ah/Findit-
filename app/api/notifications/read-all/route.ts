import { NextResponse } from "next/server";
import { markAllNotificationsRead, listNotifications } from "@/lib/repo";

export async function POST() {
  markAllNotificationsRead();
  return NextResponse.json({ notifications: listNotifications() });
}
