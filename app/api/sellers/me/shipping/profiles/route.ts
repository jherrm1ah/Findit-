import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { saveShippingProfile, type ProfileInput } from "@/lib/shipping/store";
import { sellerIdOr } from "../sellerOnly";

// Create or update (with id) a shipping profile, zones and rates included.
export async function POST(req: NextRequest) {
  const sellerId = await sellerIdOr(req);
  if (typeof sellerId !== "string") return sellerId;
  let body: ProfileInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    return NextResponse.json({ profile: await saveShippingProfile(sellerId, body) });
  } catch (err) {
    return errorResponse(err, "Couldn't save that shipping profile.");
  }
}
