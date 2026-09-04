import { NextRequest, NextResponse } from "next/server";
import { listOrders, createOrder } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";

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

  let body: { item?: string; seller?: string; price?: number; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.item || !body.seller || typeof body.price !== "number") {
    return NextResponse.json(
      { error: "item, seller, and price are required" },
      { status: 400 }
    );
  }

  const order = await createOrder({
    item: body.item,
    seller: body.seller,
    price: body.price,
    status: body.status || "Awaiting payment",
    userId: user.id,
  });
  return NextResponse.json({ order });
}
