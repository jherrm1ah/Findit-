import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSellerIdForUser } from "@/lib/repo";
import { listOwnReviews } from "@/lib/reviews";
import { errorResponse } from "@/lib/errors";

// A seller's own reviews, so they have somewhere to actually read what
// buyers wrote (previously only visible, per order, on the buyer's own
// Account screen — see migration 025). Same seller_id + legacy-name-fallback
// resolution as every other "me" seller route in this app.
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || user.role !== "seller") {
    return NextResponse.json({ error: "Seller access required." }, { status: 403 });
  }
  if (!user.businessName) {
    return NextResponse.json({ reviews: [] });
  }
  try {
    const sellerId = await getSellerIdForUser(user.id);
    const reviews = await listOwnReviews({ sellerId, sellerName: user.businessName });
    return NextResponse.json({ reviews });
  } catch (err) {
    return errorResponse(err, "Couldn't load your reviews.");
  }
}
