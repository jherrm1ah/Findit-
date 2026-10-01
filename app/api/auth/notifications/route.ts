import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, updateNotificationPref } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { errorResponse } from "@/lib/errors";

const MAX_ATTEMPTS = 20;
const WINDOW_MS = 60 * 60 * 1000;

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Log in first." }, { status: 401 });

  const { allowed, retryAfterSeconds } = await checkRateLimit(`change-notifications:${user.id}`, MAX_ATTEMPTS, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  let body: { enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const updated = await updateNotificationPref(user.id, body.enabled);
    return NextResponse.json({ user: updated });
  } catch (err) {
    return errorResponse(err, "Couldn't update your notification preference.");
  }
}
