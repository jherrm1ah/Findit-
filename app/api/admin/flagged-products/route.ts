import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { listFlaggedProductsForAdmin } from "@/lib/productReports";
import { errorResponse } from "@/lib/errors";

// Every listing currently under_review, whether a moderation rule flagged it
// or a buyer reported it — see lib/productReports.ts#listFlaggedProductsForAdmin.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req, "moderation");
  if (admin instanceof NextResponse) return admin;
  try {
    return NextResponse.json({ products: await listFlaggedProductsForAdmin() });
  } catch (err) {
    return errorResponse(err, "Couldn't load flagged listings.");
  }
}
