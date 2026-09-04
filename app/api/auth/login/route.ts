import { NextRequest, NextResponse } from "next/server";
import { verifyLogin, createSession, setSessionCookie, normalizePhone } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

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

  const rateKey = `login:${getClientIp(req)}:${normalizePhone(body.phone)}`;
  const { allowed, retryAfterSeconds } = checkRateLimit(rateKey, MAX_ATTEMPTS, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  const user = verifyLogin(body.phone, body.password);
  if (!user) {
    return NextResponse.json(
      { error: "Phone number or password is incorrect." },
      { status: 401 }
    );
  }

  const token = createSession(user.id);
  const res = NextResponse.json({ user });
  setSessionCookie(res, token);
  return res;
}
