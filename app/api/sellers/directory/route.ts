import { NextResponse } from "next/server";
import { listPublicSellerDirectory } from "@/lib/sellerDirectory";
import { errorResponse } from "@/lib/errors";

// PUBLIC, same reasoning as GET /api/sellers/[id]: a seller's storefront is
// meant to be discoverable by anyone, logged in or not, so there is no
// session check here. lib/sellerDirectory.ts is what keeps that safe — an
// explicit allowlist of columns, the same pattern as
// lib/sellerPublicProfile.ts, so a private column added to the sellers
// table later cannot leak through this route by default.
export async function GET() {
  try {
    const sellers = await listPublicSellerDirectory();
    return NextResponse.json({ sellers });
  } catch (err) {
    return errorResponse(err, "Couldn't load the seller directory.");
  }
}
