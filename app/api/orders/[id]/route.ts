import { NextRequest, NextResponse } from "next/server";
import { submitOrderReview, updateOrderStatus, getOrder, assertSellerCanSetStatus, getSellerIdForUser } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { sellerOwnsItem } from "@/lib/sellerIdentityMatch";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to manage this order." }, { status: 401 });
  }

  let body: { rating?: number; comment?: string | null; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.status) {
    const existing = await getOrder(params.id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Matching by business name alone isn't safe once two sellers can share
    // a name (business_name has no uniqueness constraint) — sellerOwnsItem
    // also requires seller_id to agree when both sides have one. See
    // migration 009.
    const canManage =
      user.role === "admin" ||
      (user.role === "seller" &&
        sellerOwnsItem(user.businessName, await getSellerIdForUser(user.id), existing.seller, existing.sellerId));
    if (!canManage) {
      return NextResponse.json(
        { error: "Only the seller on this order (or an admin) can update its status." },
        { status: 403 }
      );
    }
    try {
      // "Delivered" is the buyer's word, not the seller's — it goes through
      // POST /api/orders/[id]/confirm, which is what releases the payment.
      assertSellerCanSetStatus(body.status);
      const order = await updateOrderStatus(params.id, body.status);
      return NextResponse.json({ order });
    } catch (err) {
      return errorResponse(err, "Couldn't update that order.");
    }
  }

  if (typeof body.rating !== "number" || body.rating < 1 || body.rating > 5) {
    return NextResponse.json(
      { error: "rating must be a number between 1 and 5" },
      { status: 400 }
    );
  }

  try {
    const order = await submitOrderReview(params.id, user.id, {
      rating: body.rating,
      comment: body.comment ?? null,
    });
    if (!order) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ order });
  } catch (err) {
    return errorResponse(err, "Couldn't submit that review.");
  }
}
