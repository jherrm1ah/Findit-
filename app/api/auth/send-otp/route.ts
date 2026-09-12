import { NextRequest, NextResponse } from "next/server";
import { normalizePhone } from "@/lib/auth";
import { getDb, assertNoError } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { errorResponse } from "@/lib/errors";
import { isSmsConfigured, sendSms } from "@/lib/sms";
import { createOtp, getOtpConfig, OtpResendCooldownError, OtpPurpose } from "@/lib/otp";

// This one IP-level check is a coarse backstop against a single client
// hammering the endpoint outright; the real anti-abuse limits (hourly cap,
// resend cooldown, max resends per code — all per phone number, and cost-
// relevant since each one can spend a real SMS) live in lib/otp.ts and are
// enforced against the database, not this in-memory bucket.
const MAX_ATTEMPTS_PER_IP = 15;
const WINDOW_MS = 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  let body: { phone?: string; purpose?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.phone || body.phone.trim().length < 8) {
    return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
  }
  const purpose: OtpPurpose = body.purpose === "reset" ? "reset" : "signup";

  // Not configured yet (no TERMII_API_KEY) — tell the client to skip
  // straight past the OTP step instead of erroring, so this feature can
  // ship disabled and turn on later without breaking anyone.
  if (!isSmsConfigured()) {
    return NextResponse.json({ enabled: false });
  }

  const ip = getClientIp(req);
  const perIp = await checkRateLimit(`send-otp:${ip}`, MAX_ATTEMPTS_PER_IP, WINDOW_MS);
  if (!perIp.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later.", success: false, retryAfter: perIp.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(perIp.retryAfterSeconds) } }
    );
  }

  const phone = normalizePhone(body.phone);
  const config = getOtpConfig();

  const existing = assertNoError(
    await getDb().from("users").select("id").eq("phone", phone).maybeSingle(),
    "checking for an existing account"
  );

  if (purpose === "signup") {
    if (existing) {
      return NextResponse.json(
        { error: "An account with this phone number already exists.", success: false },
        { status: 400 }
      );
    }
  } else {
    // purpose === "reset": never reveal whether an account exists for this
    // phone — respond identically either way, and only actually spend an
    // SMS (and create a verification record) when there's a real account
    // behind it. The response body alone isn't enough: the real path below
    // also does a DB write and a network call to Termii, which takes
    // noticeably longer than this early return — timing alone could still
    // leak which case happened, so this waits roughly as long as that path
    // typically takes before answering.
    if (!existing) {
      await new Promise((resolve) => setTimeout(resolve, 150 + Math.random() * 200));
      return NextResponse.json({
        enabled: true,
        sent: true,
        success: true,
        message: "If that phone number has an account, a code was sent.",
        expiresIn: config.expiryMinutes * 60,
        resendAvailableIn: config.resendCooldownSeconds,
      });
    }
  }

  try {
    const { code, expiresInSeconds, resendAvailableInSeconds } = await createOtp({
      phone,
      purpose,
      requestIp: ip,
    });
    await sendSms(
      phone,
      `Your FindIt verification code is ${code}. It expires in ${Math.round(
        expiresInSeconds / 60
      )} minutes. Do not share this code with anyone.`
    );
    return NextResponse.json({
      enabled: true,
      sent: true,
      success: true,
      message: "OTP sent successfully.",
      expiresIn: expiresInSeconds,
      resendAvailableIn: resendAvailableInSeconds,
    });
  } catch (err) {
    if (err instanceof OtpResendCooldownError) {
      return NextResponse.json(
        {
          success: false,
          error: "Please wait before requesting another code.",
          message: "Please wait before requesting another code.",
          retryAfter: err.retryAfterSeconds,
        },
        { status: 429, headers: { "Retry-After": String(err.retryAfterSeconds) } }
      );
    }
    return errorResponse(err, "Couldn't send a verification code — try again.");
  }
}
