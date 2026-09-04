import { NextRequest, NextResponse } from "next/server";
import { listNotifications } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  return NextResponse.json({ notifications: listNotifications(user?.id) });
}
