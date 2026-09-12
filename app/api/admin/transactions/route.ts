import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { listTransactionsForAdmin } from "@/lib/payments";
import { errorResponse } from "@/lib/errors";

const VALID_KINDS = ["subscription", "order", "boost", "fee", "other"];

// Admin-only (finance domain): the real transaction ledger — every payment
// this platform has ever recorded, order or subscription, paginated.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req, "finance");
  if (admin instanceof NextResponse) return admin;

  const params = req.nextUrl.searchParams;
  const kindParam = params.get("kind");
  const kind = kindParam && VALID_KINDS.includes(kindParam) ? kindParam : undefined;
  const page = params.get("page") ? Number(params.get("page")) : undefined;

  try {
    return NextResponse.json(await listTransactionsForAdmin({ kind, page }));
  } catch (err) {
    return errorResponse(err, "Couldn't load transactions.");
  }
}
