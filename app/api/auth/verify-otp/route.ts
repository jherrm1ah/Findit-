import { NextRequest, NextResponse } from "next/server";
import { normalizePhone } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { errorResponse } from "@/lib/errors";
import { ValidationError } from "@/lib/repo";
import { isSmsConfigured, verifyOtp } from "@/lib/sms";
import { getPendingPinId, markVerified } from "@/lib/otpStore";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  let body: { phone?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.phone || !body.code) {
    return NextResponse.json({ error: "Enter the code we sent you." }, { status: 400 });
  }
  if (!isSmsConfigured()) {
    return NextResponse.json({ error: "Phone verification isn't enabled." }, { status: 400 });
  }

  const phone = normalizePhone(body.phone);

  const rate = checkRateLimit(
    `verify-otp:${getClientIp(req)}:${phone}`,
    MAX_ATTEMPTS,
    WINDOW_MS
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Request a new code." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  const pinId = getPendingPinId(phone);
  if (!pinId) {
    return NextResponse.json(
      { error: "That code has expired — request a new one." },
      { status: 400 }
    );
  }

  try {
    const ok = await verifyOtp(pinId, body.code.trim());
    if (!ok) {
      throw new ValidationError("Incorrect code — try again.");
    }
    markVerified(phone);
    return NextResponse.json({ verified: true });
  } catch (err) {
    return errorResponse(err, "Couldn't verify that code — try again.");
  }
}
