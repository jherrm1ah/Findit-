import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { listTicketsForAdmin, TicketStatus } from "@/lib/support";
import { errorResponse } from "@/lib/errors";

// Admin-only (support domain) — every ticket across every user.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req, "support");
  if (admin instanceof NextResponse) return admin;
  const status = (req.nextUrl.searchParams.get("status") as TicketStatus | null) ?? undefined;
  try {
    return NextResponse.json({ tickets: await listTicketsForAdmin(status) });
  } catch (err) {
    return errorResponse(err, "Couldn't load tickets.");
  }
}
