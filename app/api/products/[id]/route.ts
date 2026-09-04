import { NextRequest, NextResponse } from "next/server";
import { getProduct, updateProduct, ProductPatch } from "@/lib/products";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  const product = getProduct(id);
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ product });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (!getProduct(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let patch: ProductPatch;
  try {
    patch = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const product = updateProduct(id, patch);
    return NextResponse.json({ product });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid patch";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
