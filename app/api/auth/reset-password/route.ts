import { NextRequest, NextResponse } from "next/server";
import { normalizePhone, resetPasswordForPhone } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { errorResponse } from "@/lib/errors";
import { isSmsConfigured } from "@/lib/sms";
import { isRecentlyVerified, clearOtp } from "@/lib/otpStore";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

// Unauthenticated by design — this IS the "I can't log in" recovery path.
// Safety instead comes from requiring a phone that was just OTP-verified
// (see lib/otpStore.ts#isRecentlyVerified), the same proof-of-phone-
// ownership gate signup uses.
export async function POST(req: NextRequest) {
  if (!isSmsConfigured()) {
    return NextResponse.json(
      { error: "Password reset isn't available yet — contact support." },
      { status: 400 }
    );
  }

  const rateKey = `reset-password:${getClientIp(req)}`;
  const { allowed, retryAfterSeconds } = checkRateLimit(rateKey, MAX_ATTEMPTS, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  let body: { phone?: string; newPassword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.phone || !body.newPassword) {
    return NextResponse.json({ error: "Enter your phone number and new password." }, { status: 400 });
  }

  const phone = normalizePhone(body.phone);
  if (!isRecentlyVerified(phone)) {
    return NextResponse.json({ error: "Verify your phone number first." }, { status: 400 });
  }

  try {
    await resetPasswordForPhone(phone, body.newPassword);
    clearOtp(phone);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Couldn't reset your password.");
  }
}
