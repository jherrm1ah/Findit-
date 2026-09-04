import { NextRequest, NextResponse } from "next/server";
import { submitOrderReview, updateOrderStatus, getOrder } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";

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
    const canManage = user.role === "admin" || (user.role === "seller" && user.businessName === existing.seller);
    if (!canManage) {
      return NextResponse.json(
        { error: "Only the seller on this order (or an admin) can update its status." },
        { status: 403 }
      );
    }
    try {
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
