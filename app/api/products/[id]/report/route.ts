import { NextRequest, NextResponse } from "next/server";
import { reportProduct, REPORT_REASONS } from "@/lib/productReports";
import { getSessionUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rateLimit";

const MAX_REPORTS = 20;
const WINDOW_MS = 60 * 60 * 1000;

// Any signed-in user can flag a listing for a human to look at — same
// report → admin-resolves shape as the existing order-issue report
// (app/api/orders/[id]/issue), but rate-limited the way support ticket
// creation is (this one's a claim about someone ELSE's content).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to report a listing." }, { status: 401 });
  }

  const { allowed, retryAfterSeconds } = await checkRateLimit(`report-product:${user.id}`, MAX_REPORTS, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many reports submitted recently. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  let body: { reason?: string; details?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.reason || !REPORT_REASONS.includes(body.reason as (typeof REPORT_REASONS)[number])) {
    return NextResponse.json({ error: "Choose a valid reason for the report." }, { status: 400 });
  }

  try {
    const report = await reportProduct({
      productId: params.id,
      reporterId: user.id,
      reason: body.reason as (typeof REPORT_REASONS)[number],
      details: body.details ?? null,
    });
    return NextResponse.json({ report });
  } catch (err) {
    return errorResponse(err, "Couldn't submit that report.");
  }
}
