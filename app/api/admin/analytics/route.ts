import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { getPlatformAnalytics } from "@/lib/analytics";
import { errorResponse } from "@/lib/errors";

const MIN_DAYS = 7;
const MAX_DAYS = 90;
const DEFAULT_DAYS = 30;

// Admin-only (finance domain — same domain as MRR/revenue on the Overview
// tab). Every series is a live GROUP BY over real rows (see
// lib/analytics.ts) — never a projected or simulated trend line.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req, "finance");
  if (admin instanceof NextResponse) return admin;

  const daysParam = Number(req.nextUrl.searchParams.get("days"));
  const days = Number.isFinite(daysParam) ? Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(daysParam))) : DEFAULT_DAYS;

  try {
    return NextResponse.json({ analytics: await getPlatformAnalytics(days) });
  } catch (err) {
    return errorResponse(err, "Couldn't load platform analytics.");
  }
}
