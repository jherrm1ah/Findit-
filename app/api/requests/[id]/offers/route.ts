import { NextRequest, NextResponse } from "next/server";
import { addSellerOfferToRequest } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = getSessionUser(req);
  if (user?.role !== "seller") {
    return NextResponse.json({ error: "Seller access required." }, { status: 403 });
  }

  const offer = addSellerOfferToRequest(params.id, user.businessName);
  if (!offer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ offer });
}
