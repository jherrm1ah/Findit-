import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, updateUserName } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { errorResponse } from "@/lib/errors";

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 60 * 60 * 1000;

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Log in first." }, { status: 401 });

  const { allowed, retryAfterSeconds } = await checkRateLimit(`change-name:${user.id}`, MAX_ATTEMPTS, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.name) {
    return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  }

  try {
    const updated = await updateUserName(user.id, body.name);
    return NextResponse.json({ user: updated });
  } catch (err) {
    return errorResponse(err, "Couldn't update your name.");
  }
}
