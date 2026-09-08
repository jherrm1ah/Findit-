import { NextRequest, NextResponse } from "next/server";
import { unsaveItem } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { productId: string } }
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to manage your saved items." }, { status: 401 });
  }
  await unsaveItem(user.id, params.productId);
  return NextResponse.json({ ok: true });
}
