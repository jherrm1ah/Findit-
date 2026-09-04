import { NextRequest, NextResponse } from "next/server";
import { addSellerOfferToRequest } from "@/lib/repo";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const offer = addSellerOfferToRequest(params.id);
  if (!offer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ offer });
}
