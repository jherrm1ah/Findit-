import { NextRequest, NextResponse } from "next/server";
import { listNotifications } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to see your notifications." }, { status: 401 });
  }
  return NextResponse.json({ notifications: await listNotifications(user.id) });
}
