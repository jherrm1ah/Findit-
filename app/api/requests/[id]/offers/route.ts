import { NextRequest, NextResponse } from "next/server";
import { addSellerOfferToRequest } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = getSessionUser(req);
  const sellerName = user?.role === "seller" ? user.businessName : null;
  const offer = addSellerOfferToRequest(params.id, sellerName);
  if (!offer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ offer });
}
