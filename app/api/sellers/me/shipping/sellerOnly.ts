import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSellerIdForUser } from "@/lib/repo";

// The signed-in seller's store id, or the response to send instead.
export async function sellerIdOr(req: NextRequest): Promise<string | NextResponse> {
  const user = await getSessionUser(req);
  if (!user || user.role !== "seller") return NextResponse.json({ error: "Seller access required." }, { status: 403 });
  const sellerId = await getSellerIdForUser(user.id);
  if (!sellerId) return NextResponse.json({ error: "Set up your store first." }, { status: 404 });
  return sellerId;
}
