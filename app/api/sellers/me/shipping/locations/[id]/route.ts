import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { deleteSellerLocation } from "@/lib/shipping/store";
import { sellerIdOr } from "../../sellerOnly";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const sellerId = await sellerIdOr(req);
  if (typeof sellerId !== "string") return sellerId;
  try {
    await deleteSellerLocation(sellerId, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Couldn't delete that location.");
  }
}
