import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSellerStatusForUser } from "@/lib/repo";

// Lets a seller see their own verification status (pending/approved/
// rejected) — previously the only way to find this out was to try to
// create a listing or upload an image and get a 403 back.
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || user.role !== "seller") {
    return NextResponse.json({ error: "Seller access required." }, { status: 403 });
  }
  const status = await getSellerStatusForUser(user.id);
  return NextResponse.json({ status });
}
