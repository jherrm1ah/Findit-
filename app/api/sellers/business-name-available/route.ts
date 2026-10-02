import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, isBusinessNameTaken } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { errorResponse } from "@/lib/errors";

const MAX_ATTEMPTS = 30;
const WINDOW_MS = 10 * 60 * 1000;

// A soft, advisory lookup only — see lib/auth.ts#isBusinessNameTaken for
// why this never blocks anything, just powers a "this name's already in
// use" hint while a seller is typing (signup, "Start selling," or renaming
// in Personal details). Reachable without a session (signup hasn't created
// an account yet), rate-limited the same way every other guest-reachable
// lookup in this app is.
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  const key = `biz-name-check:${user?.id ?? getClientIp(req)}`;
  const { allowed, retryAfterSeconds } = await checkRateLimit(key, MAX_ATTEMPTS, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many checks — slow down a moment." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  const name = req.nextUrl.searchParams.get("name") || "";
  try {
    // A logged-in seller re-typing (or keeping) their own current name
    // never gets warned about themselves.
    const taken = await isBusinessNameTaken(name, user?.id ?? null);
    return NextResponse.json({ taken });
  } catch (err) {
    return errorResponse(err, "Couldn't check that name.");
  }
}
