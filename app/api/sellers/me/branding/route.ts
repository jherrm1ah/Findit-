import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSellerIdForUser, updateSellerBranding, isValidProductImageUrl } from "@/lib/repo";
import { errorResponse } from "@/lib/errors";

function storagePrefix(): string {
  return `${process.env.SUPABASE_URL ?? ""}/storage/v1/object/public/product-images/`;
}

// Real backing for the Store subscription "customization" benefit — see
// lib/subscriptions.ts#assertCanCustomizeStore, called inside
// updateSellerBranding. A Free/Basic seller can't set a logo/banner just by
// finding this endpoint; the plan check happens here, not in the UI.
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || user.role !== "seller") {
    return NextResponse.json({ error: "Seller access required." }, { status: 403 });
  }
  const sellerId = await getSellerIdForUser(user.id);
  if (!sellerId) {
    return NextResponse.json({ error: "No store found for this account yet." }, { status: 404 });
  }

  let body: { logoUrl?: string | null; bannerUrl?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && value !== null && (typeof value !== "string" || !isValidProductImageUrl(value, storagePrefix()))) {
      return NextResponse.json({ error: `${key} must be an image uploaded through FindIt, or null.` }, { status: 400 });
    }
  }

  try {
    await updateSellerBranding(sellerId, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Couldn't update your store branding.");
  }
}
