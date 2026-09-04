import { NextRequest, NextResponse } from "next/server";
import { listProducts, createProduct } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  return NextResponse.json({ products: listProducts() });
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (user?.role !== "seller") {
    return NextResponse.json({ error: "Seller access required." }, { status: 403 });
  }

  let body: { category?: string; name?: string; price?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.category || !body.name || typeof body.price !== "number") {
    return NextResponse.json(
      { error: "category, name, and price are required" },
      { status: 400 }
    );
  }

  try {
    const product = createProduct({
      category: body.category,
      name: body.name,
      price: body.price,
      seller: user.businessName!,
    });
    return NextResponse.json({ product });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't create that listing.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
