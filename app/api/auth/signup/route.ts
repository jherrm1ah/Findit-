import { NextRequest, NextResponse } from "next/server";
import { createUser, createSession, setSessionCookie, normalizePhone } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { errorResponse } from "@/lib/errors";
import { isSmsConfigured } from "@/lib/sms";
import { isRecentlyVerified, clearOtp } from "@/lib/otpStore";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const rateKey = `signup:${getClientIp(req)}`;
  const { allowed, retryAfterSeconds } = checkRateLimit(rateKey, MAX_ATTEMPTS, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many signup attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  let body: {
    phone?: string;
    password?: string;
    name?: string;
    role?: string;
    businessName?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { phone, password, name, role, businessName } = body;
  if (!phone || phone.trim().length < 10) {
    return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
  }
  if (!password || password.length < 4) {
    return NextResponse.json(
      { error: "Password must be at least 4 characters." },
      { status: 400 }
    );
  }
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  }
  if (role !== "buyer" && role !== "seller") {
    return NextResponse.json({ error: "Choose an account type." }, { status: 400 });
  }
  if (role === "seller" && (!businessName || !businessName.trim())) {
    return NextResponse.json({ error: "Enter your business name." }, { status: 400 });
  }

  const normalizedPhone = normalizePhone(phone);
  const phoneVerified = isSmsConfigured() ? isRecentlyVerified(normalizedPhone) : true;
  if (isSmsConfigured() && !phoneVerified) {
    return NextResponse.json(
      { error: "Verify your phone number first." },
      { status: 400 }
    );
  }

  try {
    const user = await createUser({
      phone,
      password,
      name: name.trim(),
      role,
      businessName: role === "seller" ? businessName!.trim() : null,
      phoneVerified,
    });
    if (isSmsConfigured()) clearOtp(normalizedPhone);
    const token = await createSession(user.id);
    const res = NextResponse.json({ user });
    setSessionCookie(res, token);
    return res;
  } catch (err) {
    return errorResponse(err, "Couldn't create that account.");
  }
}
