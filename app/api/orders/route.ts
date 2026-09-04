import { NextRequest, NextResponse } from "next/server";
import { listOrders, createOrder } from "@/lib/repo";

export async function GET() {
  return NextResponse.json({ orders: listOrders() });
}

export async function POST(req: NextRequest) {
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

  const order = createOrder({
    item: body.item,
    seller: body.seller,
    price: body.price,
    status: body.status || "Awaiting payment",
  });
  return NextResponse.json({ order });
}
