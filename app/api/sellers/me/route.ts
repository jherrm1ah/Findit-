import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSellerStatusForUser, getSellerBrandingForUser } from "@/lib/repo";

// Lets a seller see their own verification status (pending/approved/
// rejected) — previously the only way to find this out was to try to
// create a listing or upload an image and get a 403 back. Also carries
// their current store branding (logo/banner) so the dashboard's branding
// card can show what's actually set without a separate round trip.
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || user.role !== "seller") {
    return NextResponse.json({ error: "Seller access required." }, { status: 403 });
  }
  const [status, branding] = await Promise.all([
    getSellerStatusForUser(user.id),
    getSellerBrandingForUser(user.id),
  ]);
  return NextResponse.json({ status, logoUrl: branding?.logoUrl ?? null, bannerUrl: branding?.bannerUrl ?? null });
}
