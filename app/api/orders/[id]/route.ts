import { NextRequest, NextResponse } from "next/server";
import { submitOrderReview, updateOrderStatus, getOrder } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: { rating?: number; comment?: string | null; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.status) {
    const user = getSessionUser(req);
    const existing = getOrder(params.id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const canManage = user?.role === "admin" || (user?.role === "seller" && user.businessName === existing.seller);
    if (!canManage) {
      return NextResponse.json(
        { error: "Only the seller on this order (or an admin) can update its status." },
        { status: 403 }
      );
    }
    try {
      const order = updateOrderStatus(params.id, body.status);
      return NextResponse.json({ order });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't update that order.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  if (typeof body.rating !== "number" || body.rating < 1 || body.rating > 5) {
    return NextResponse.json(
      { error: "rating must be a number between 1 and 5" },
      { status: 400 }
    );
  }

  const order = submitOrderReview(params.id, {
    rating: body.rating,
    comment: body.comment ?? null,
  });
  if (!order) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ order });
}
