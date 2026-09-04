import { NextRequest, NextResponse } from "next/server";
import { verifyLogin, createSession, setSessionCookie, normalizePhone } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { errorResponse } from "@/lib/errors";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

// A second, IP-independent limiter keyed on the phone number alone. Without
// this, a distributed attack (many IPs, one target phone) sails straight
// through the per-(IP,phone) limiter below — each new IP gets its own fresh
// 5 attempts against the same account. This one is more generous (multiple
// real people/devices can legitimately share a phone-linked account across
// networks) but still caps the total guesses any single account can absorb.
const MAX_ATTEMPTS_PER_PHONE = 20;

export async function POST(req: NextRequest) {
  let body: { phone?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.phone || !body.password) {
    return NextResponse.json({ error: "Enter your phone and password." }, { status: 400 });
  }

  const phone = normalizePhone(body.phone);

  const perSource = checkRateLimit(`login:${getClientIp(req)}:${phone}`, MAX_ATTEMPTS, WINDOW_MS);
  const perAccount = checkRateLimit(`login-phone:${phone}`, MAX_ATTEMPTS_PER_PHONE, WINDOW_MS);
  if (!perSource.allowed || !perAccount.allowed) {
    const retryAfterSeconds = Math.max(perSource.retryAfterSeconds, perAccount.retryAfterSeconds);
    return NextResponse.json(
      { error: "Too many login attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  try {
    const user = await verifyLogin(body.phone, body.password);
    if (!user) {
      return NextResponse.json(
        { error: "Phone number or password is incorrect." },
        { status: 401 }
      );
    }

    const token = await createSession(user.id);
    const res = NextResponse.json({ user });
    setSessionCookie(res, token);
    return res;
  } catch (err) {
    return errorResponse(err, "Couldn't log you in.");
  }
}
