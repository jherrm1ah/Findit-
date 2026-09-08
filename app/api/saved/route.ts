import { NextRequest, NextResponse } from "next/server";
import { listSavedProductIds, saveItem } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to see your saved items." }, { status: 401 });
  }
  return NextResponse.json({ productIds: await listSavedProductIds(user.id) });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to save items." }, { status: 401 });
  }

  let body: { productId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.productId) {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }

  await saveItem(user.id, body.productId);
  return NextResponse.json({ ok: true });
}
