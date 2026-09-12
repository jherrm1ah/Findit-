import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/adminRoles";
import { getDb, assertNoError } from "@/lib/db";
import { errorResponse } from "@/lib/errors";

// Aggregate OTP activity for the admin dashboard — never plaintext codes,
// never Termii credentials, never which specific phone numbers were
// involved. Computed in application code from a bounded recent window
// rather than a SQL aggregate view/materialized table, which is the right
// tradeoff at FindIt's current (pre-launch) volume; revisit if OTP volume
// ever makes a 2,000-row scan a real cost.
const WINDOW_DAYS = 7;
const ROW_LIMIT = 2000;

type OtpRow = {
  purpose: string;
  used: boolean;
  verified_at: string | null;
  attempts: number;
  resend_count: number;
  expires_at: string;
};

// Super-admin only, matching where this actually surfaces: the Activity tab,
// which AdminQueue.jsx renders for super admins alone, alongside the admin
// action log (GET /api/admin/actions, already super-admin). Until this was
// tightened, any scoped admin — a support admin, say — could read platform
// authentication telemetry by calling the route directly, because the
// restriction existed only in the frontend's tab list. Frontend hiding is
// not authorization.
export async function GET(req: NextRequest) {
  const admin = await requireSuperAdmin(req);
  if (admin instanceof NextResponse) return admin;

  try {
    const windowStart = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const result = await getDb()
      .from("otp_verifications")
      .select("purpose, used, verified_at, attempts, resend_count, expires_at")
      .gte("created_at", windowStart)
      .limit(ROW_LIMIT);
    const rows = assertNoError(result, "loading OTP stats") as OtpRow[];

    const now = Date.now();
    const stats = {
      windowDays: WINDOW_DAYS,
      totalRequested: rows.length,
      totalVerified: rows.filter((r) => r.used && r.verified_at).length,
      totalExpiredUnverified: rows.filter((r) => !r.used && new Date(r.expires_at).getTime() < now).length,
      totalFailedAttempts: rows.reduce((sum, r) => sum + (r.attempts || 0), 0),
      totalResends: rows.reduce((sum, r) => sum + (r.resend_count || 0), 0),
      signupRequests: rows.filter((r) => r.purpose === "signup").length,
      resetRequests: rows.filter((r) => r.purpose === "reset").length,
    };
    return NextResponse.json({ stats });
  } catch (err) {
    // Previously uncaught: a database error escaped as an unhandled
    // rejection rather than this codebase's standard, sanitised shape.
    return errorResponse(err, "Couldn't load OTP stats.");
  }
}
