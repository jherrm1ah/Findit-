import { NextRequest, NextResponse } from "next/server";
import { getProduct, updateProduct, deleteProduct } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";

function canManage(
  user: ReturnType<typeof getSessionUser>,
  product: NonNullable<ReturnType<typeof getProduct>>
) {
  return user?.role === "admin" || (user?.role === "seller" && user.businessName === product.seller);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const product = getProduct(params.id);
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const user = getSessionUser(req);
  if (!canManage(user, product)) {
    return NextResponse.json(
      { error: "Only the seller who owns this listing (or an admin) can edit it." },
      { status: 403 }
    );
  }

  let body: { name?: string; category?: string; price?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const updated = updateProduct(params.id, body);
    return NextResponse.json({ product: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't update that listing.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const product = getProduct(params.id);
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const user = getSessionUser(req);
  if (!canManage(user, product)) {
    return NextResponse.json(
      { error: "Only the seller who owns this listing (or an admin) can delete it." },
      { status: 403 }
    );
  }

  deleteProduct(params.id);
  return NextResponse.json({ ok: true });
}
