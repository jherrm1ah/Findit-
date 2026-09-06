import { NextRequest, NextResponse } from "next/server";
import { normalizePhone } from "@/lib/auth";
import { getDb, assertNoError } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { errorResponse } from "@/lib/errors";
import { isSmsConfigured, sendOtp } from "@/lib/sms";
import { savePendingOtp } from "@/lib/otpStore";

const MAX_ATTEMPTS_PER_IP = 5;
const MAX_ATTEMPTS_PER_PHONE = 3;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.phone || body.phone.trim().length < 10) {
    return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
  }

  // Not configured yet (no TERMII_API_KEY) — tell the client to skip
  // straight to signup instead of erroring, so this feature can ship
  // disabled and turn on later without breaking anyone.
  if (!isSmsConfigured()) {
    return NextResponse.json({ enabled: false });
  }

  const phone = normalizePhone(body.phone);

  const perIp = checkRateLimit(`send-otp:${getClientIp(req)}`, MAX_ATTEMPTS_PER_IP, WINDOW_MS);
  const perPhone = checkRateLimit(`send-otp-phone:${phone}`, MAX_ATTEMPTS_PER_PHONE, WINDOW_MS);
  if (!perIp.allowed || !perPhone.allowed) {
    const retryAfterSeconds = Math.max(perIp.retryAfterSeconds, perPhone.retryAfterSeconds);
    return NextResponse.json(
      { error: "Too many code requests. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  const existing = assertNoError(
    await getDb().from("users").select("id").eq("phone", phone).maybeSingle(),
    "checking for an existing account"
  );
  if (existing) {
    return NextResponse.json(
      { error: "An account with this phone number already exists." },
      { status: 400 }
    );
  }

  try {
    const { pinId } = await sendOtp(phone);
    savePendingOtp(phone, pinId);
    return NextResponse.json({ enabled: true, sent: true });
  } catch (err) {
    return errorResponse(err, "Couldn't send a verification code — try again.");
  }
}
