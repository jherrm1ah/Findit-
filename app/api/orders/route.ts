import { NextRequest, NextResponse } from "next/server";
import { listOrders, createOrderFromProduct } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to see your orders." }, { status: 401 });
  }
  const sellerName = user.role === "seller" ? user.businessName : null;
  return NextResponse.json({ orders: await listOrders(user.id, sellerName) });
}

export async function POST(req: NextRequest) {
  // Placing a real order needs a real, identifiable buyer — an anonymous
  // "guest" order has no owner to look it up under later, and (before this
  // migration) every guest order shared one unscoped bucket, so any guest
  // could see every other guest's orders. Real checkout requires login.
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to place an order." }, { status: 401 });
  }

  let body: { productId?: string; qty?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.productId) {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }

  // item/seller/price are NEVER taken from the client here — only which
  // product and how many. The real price and seller come from the product
  // row itself (see lib/repo.ts#createOrderFromProduct), so a buyer can't
  // tamper with what they're charged or who they appear to be ordering from.
  try {
    const qty = Number(body.qty) > 0 ? Number(body.qty) : 1;
    const order = await createOrderFromProduct(body.productId, qty, user.id);
    return NextResponse.json({ order });
  } catch (err) {
    return errorResponse(err, "Couldn't place that order.");
  }
}
