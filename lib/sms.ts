// Termii SMS OTP client. Termii generates and tracks the actual code on
// their side — we only ever hold an opaque pin_id, never the code itself.
//
// This feature is fully optional and off until TERMII_API_KEY is set: no
// key configured means isSmsConfigured() is false, and the signup route
// (see app/api/auth/signup/route.ts) skips the phone-verification gate
// entirely rather than locking everyone out. That's deliberate — this
// sandbox has no network access to termii.com to test against, so the
// feature is designed to fail open into "not required" rather than risk
// breaking real signups on a misconfigured or unreachable provider.
const TERMII_BASE_URL = "https://api.ng.termii.com/api";
const PIN_LENGTH = 6;
const PIN_TTL_MINUTES = 10;

export function isSmsConfigured(): boolean {
  return Boolean(process.env.TERMII_API_KEY);
}

function requireApiKey(): string {
  const key = process.env.TERMII_API_KEY;
  if (!key) throw new Error("TERMII_API_KEY is not set");
  return key;
}

export async function sendOtp(phone: string): Promise<{ pinId: string }> {
  const apiKey = requireApiKey();
  const res = await fetch(`${TERMII_BASE_URL}/sms/otp/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      message_type: "NUMERIC",
      to: phone,
      from: process.env.TERMII_SENDER_ID || "N-Alert",
      channel: "generic",
      pin_attempts: 3,
      pin_time_to_live: PIN_TTL_MINUTES,
      pin_length: PIN_LENGTH,
      pin_placeholder: "< 1234 >",
      message_text: `Your FindIt verification code is < 1234 >. It expires in ${PIN_TTL_MINUTES} minutes.`,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.pinId) {
    console.error("[sms] Termii send failed", res.status, data);
    throw new Error("Failed to send verification code");
  }
  return { pinId: data.pinId as string };
}

export async function verifyOtp(pinId: string, pin: string): Promise<boolean> {
  const apiKey = requireApiKey();
  const res = await fetch(`${TERMII_BASE_URL}/sms/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, pin_id: pinId, pin }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[sms] Termii verify failed", res.status, data);
    throw new Error("Failed to verify code");
  }
  return data.verified === true || data.verified === "True";
}
