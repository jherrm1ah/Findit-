import { NextResponse } from "next/server";
import { listNotifications } from "@/lib/repo";

export async function GET() {
  return NextResponse.json({ notifications: listNotifications() });
}
