import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSellerIdForUser, updateSellerBranding, isValidProductImageUrl } from "@/lib/repo";
import { isStoreTemplateId, isStoreAccentId } from "@/lib/subscriptions";
import { errorResponse } from "@/lib/errors";

function storagePrefix(): string {
  return `${process.env.SUPABASE_URL ?? ""}/storage/v1/object/public/product-images/`;
}

// Real backing for the Store subscription "customization" benefit — see
// lib/subscriptions.ts#assertCanCustomizeStore and #assertCanUseStoreTemplate,
// both called inside updateSellerBranding. A seller on a plan that doesn't
// unlock these can't set them just by finding this endpoint; the real
// check happens there, not in the UI.
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || user.role !== "seller") {
    return NextResponse.json({ error: "Seller access required." }, { status: 403 });
  }
  const sellerId = await getSellerIdForUser(user.id);
  if (!sellerId) {
    return NextResponse.json({ error: "No store found for this account yet." }, { status: 404 });
  }

  let body: { logoUrl?: string | null; bannerUrl?: string | null; storeTemplate?: string; storeAccent?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // logoUrl/bannerUrl are image fields (or null to clear); storeTemplate and
  // storeAccent are plain id strings — each needs its own validation, not
  // one loop that treats every key in the body as an image URL.
  for (const key of ["logoUrl", "bannerUrl"] as const) {
    const value = body[key];
    if (value !== undefined && value !== null && (typeof value !== "string" || !isValidProductImageUrl(value, storagePrefix()))) {
      return NextResponse.json({ error: `${key} must be an image uploaded through FindIt, or null.` }, { status: 400 });
    }
  }
  if (body.storeTemplate !== undefined && (typeof body.storeTemplate !== "string" || !isStoreTemplateId(body.storeTemplate))) {
    return NextResponse.json({ error: "storeTemplate must be a known template id." }, { status: 400 });
  }
  if (body.storeAccent !== undefined && (typeof body.storeAccent !== "string" || !isStoreAccentId(body.storeAccent))) {
    return NextResponse.json({ error: "storeAccent must be a known accent color id." }, { status: 400 });
  }

  try {
    await updateSellerBranding(sellerId, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Couldn't update your store branding.");
  }
}
