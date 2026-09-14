import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSellerIdForUser } from "@/lib/repo";
import { replyToReview } from "@/lib/reviews";
import { errorResponse } from "@/lib/errors";

// A seller replying to one of their own reviews. Ownership is checked
// server-side by lib/reviews.ts#sellerOwnsReview, not by trusting the
// caller's own idea of which reviews are theirs.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser(req);
  if (!user || user.role !== "seller" || !user.businessName) {
    return NextResponse.json({ error: "Seller access required." }, { status: 403 });
  }

  let body: { reply?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.reply !== "string") {
    return NextResponse.json({ error: "Write a reply before sending." }, { status: 400 });
  }

  try {
    const sellerId = await getSellerIdForUser(user.id);
    const review = await replyToReview(params.id, { sellerId, sellerName: user.businessName }, body.reply);
    if (!review) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ review });
  } catch (err) {
    return errorResponse(err, "Couldn't save your reply.");
  }
}
