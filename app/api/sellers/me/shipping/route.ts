import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSellerIdForUser } from "@/lib/repo";
import { errorResponse } from "@/lib/errors";
import { getShippingConfig } from "@/lib/shipping/store";
import { providerStatuses } from "@/lib/shipping/carriers";

// The seller's shipping settings: profiles (zones and rates), locations, and
// which logistics providers can be connected.
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || user.role !== "seller") return NextResponse.json({ error: "Seller access required." }, { status: 403 });
  const sellerId = await getSellerIdForUser(user.id);
  if (!sellerId) return NextResponse.json({ error: "Set up your store first." }, { status: 404 });
  try {
    const config = await getShippingConfig(sellerId);
    return NextResponse.json({ ...config, carriers: providerStatuses().map(({ credentials: _credentials, ...p }) => p) });
  } catch (err) {
    return errorResponse(err, "Couldn't load your shipping settings.");
  }
}
