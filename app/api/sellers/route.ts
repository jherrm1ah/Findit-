import { NextRequest, NextResponse } from "next/server";
import { listSellers } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  return NextResponse.json({ sellers: await listSellers() });
}
