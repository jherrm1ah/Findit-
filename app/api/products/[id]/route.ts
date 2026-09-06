import { NextRequest, NextResponse } from "next/server";
import { getProduct, updateProduct, deleteProduct, isValidProductImageUrl, Product } from "@/lib/repo";
import { getSessionUser, User } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";

function storagePrefix(): string {
  return `${process.env.SUPABASE_URL ?? ""}/storage/v1/object/public/product-images/`;
}

function canManage(user: User | null, product: Product) {
  return user?.role === "admin" || (user?.role === "seller" && user.businessName === product.seller);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const product = await getProduct(params.id);
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const user = await getSessionUser(req);
  if (!canManage(user, product)) {
    return NextResponse.json(
      { error: "Only the seller who owns this listing (or an admin) can edit it." },
      { status: 403 }
    );
  }

  let body: {
    name?: string;
    category?: string;
    price?: number;
    imageUrl?: string | null;
    lat?: number | null;
    lng?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.imageUrl && !isValidProductImageUrl(body.imageUrl, storagePrefix())) {
    return NextResponse.json(
      { error: "imageUrl must be an image uploaded through FindIt." },
      { status: 400 }
    );
  }

  try {
    const updated = await updateProduct(params.id, body);
    return NextResponse.json({ product: updated });
  } catch (err) {
    return errorResponse(err, "Couldn't update that listing.");
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const product = await getProduct(params.id);
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const user = await getSessionUser(req);
  if (!canManage(user, product)) {
    return NextResponse.json(
      { error: "Only the seller who owns this listing (or an admin) can delete it." },
      { status: 403 }
    );
  }

  await deleteProduct(params.id);
  return NextResponse.json({ ok: true });
}
