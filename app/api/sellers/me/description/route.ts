import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSellerIdForUser, updateSellerDescription } from "@/lib/repo";
import { errorResponse } from "@/lib/errors";

// Deliberately separate from POST /api/sellers/me/verification: that route
// re-submits the whole verification package and resets verification_status
// to 'pending', which is right for the fields that actually describe the
// business but wrong for a seller who only wants to fix a typo in their
// bio. This is the one field a seller can always edit, whatever their
// current verification_status — nothing here touches that status.
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || user.role !== "seller") {
    return NextResponse.json({ error: "Seller access required." }, { status: 403 });
  }
  const sellerId = await getSellerIdForUser(user.id);
  if (!sellerId) {
    return NextResponse.json({ error: "No store found for this account yet." }, { status: 404 });
  }

  let body: { description?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.description !== undefined && body.description !== null && typeof body.description !== "string") {
    return NextResponse.json({ error: "description must be a string or null." }, { status: 400 });
  }

  try {
    await updateSellerDescription(sellerId, body.description ?? null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Couldn't update your bio.");
  }
}
