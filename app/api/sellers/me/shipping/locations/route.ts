import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { saveSellerLocation, type LocationInput } from "@/lib/shipping/store";
import { sellerIdOr } from "../sellerOnly";

// Create or update (with id) a fulfilment/pickup location.
export async function POST(req: NextRequest) {
  const sellerId = await sellerIdOr(req);
  if (typeof sellerId !== "string") return sellerId;
  let body: LocationInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    return NextResponse.json({ location: await saveSellerLocation(sellerId, body) });
  } catch (err) {
    return errorResponse(err, "Couldn't save that location.");
  }
}
