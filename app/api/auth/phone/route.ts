import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, updateUserPhone } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { errorResponse } from "@/lib/errors";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Log in first." }, { status: 401 });

  const { allowed, retryAfterSeconds } = await checkRateLimit(`change-phone:${user.id}`, MAX_ATTEMPTS, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  let body: { newPhone?: string; currentPassword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.newPhone || !body.currentPassword) {
    return NextResponse.json(
      { error: "Enter your new phone number and current password." },
      { status: 400 }
    );
  }

  try {
    const updated = await updateUserPhone(user.id, body.newPhone, body.currentPassword);
    return NextResponse.json({ user: updated });
  } catch (err) {
    return errorResponse(err, "Couldn't update your phone number.");
  }
}
