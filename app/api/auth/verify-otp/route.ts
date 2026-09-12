import { NextRequest, NextResponse } from "next/server";
import { normalizePhone } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isSmsConfigured } from "@/lib/sms";
import { verifyOtp, OtpPurpose } from "@/lib/otp";

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;

const REASON_MESSAGES: Record<string, string> = {
  not_found: "That code has expired — request a new one.",
  expired: "That code has expired — request a new one.",
  too_many_attempts: "Too many attempts. Request a new code.",
  incorrect: "Incorrect code — try again.",
};

export async function POST(req: NextRequest) {
  let body: { phone?: string; code?: string; purpose?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", success: false }, { status: 400 });
  }
  if (!body.phone || !body.code) {
    return NextResponse.json(
      { error: "Enter the code we sent you.", success: false },
      { status: 400 }
    );
  }
  if (!isSmsConfigured()) {
    return NextResponse.json(
      { error: "Phone verification isn't enabled.", success: false },
      { status: 400 }
    );
  }

  const phone = normalizePhone(body.phone);
  const purpose: OtpPurpose = body.purpose === "reset" ? "reset" : "signup";

  // Per-OTP attempt limits live inside lib/otp.ts's own attempts/max_attempts
  // columns; this is the same coarse IP+phone backstop used everywhere else
  // in the app, guarding against a script hammering the endpoint directly.
  const rate = await checkRateLimit(`verify-otp:${getClientIp(req)}:${phone}`, MAX_ATTEMPTS, WINDOW_MS);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Request a new code.", success: false, retryAfter: rate.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  const result = await verifyOtp({ phone, purpose, code: body.code.trim() });
  if (result.ok) {
    return NextResponse.json({
      success: true,
      verified: true,
      message: "Phone number verified successfully.",
    });
  }

  return NextResponse.json(
    { error: REASON_MESSAGES[result.reason], success: false, verified: false },
    { status: 400 }
  );
}
