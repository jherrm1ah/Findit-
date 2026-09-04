import { NextRequest, NextResponse } from "next/server";
import { markNotificationRead } from "@/lib/repo";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const notification = markNotificationRead(params.id);
  if (!notification) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ notification });
}
