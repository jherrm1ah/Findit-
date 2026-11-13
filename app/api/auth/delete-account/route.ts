import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, deleteAccount, clearSessionCookie } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { errorResponse } from "@/lib/errors";

// Deletes the signed-in account after re-checking its password (see lib/auth.ts#deleteAccount and
// migration 048). 409 with `blocked` reasons while paid orders or payouts are still in progress.
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Log in first." }, { status: 401 });

  const { allowed, retryAfterSeconds } = await checkRateLimit(`delete-account:${user.id}`, 5, 15 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  let body: { password?: string; confirm?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.password) return NextResponse.json({ error: "Enter your password." }, { status: 400 });
  if ((body.confirm ?? "").trim().toUpperCase() !== "DELETE") {
    return NextResponse.json({ error: "Type DELETE to confirm." }, { status: 400 });
  }

  try {
    const result = await deleteAccount(user.id, body.password);
    if (!result.ok) return NextResponse.json({ error: "Your account can't be deleted yet.", blocked: result.blocked }, { status: 409 });
    const res = NextResponse.json({ ok: true });
    clearSessionCookie(res);
    return res;
  } catch (err) {
    return errorResponse(err, "Couldn't delete your account.");
  }
}
