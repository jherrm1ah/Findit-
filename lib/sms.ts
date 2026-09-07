import { toTermiiRecipient } from "./phone";

// Termii SMS client — sends plain SMS only. FindIt owns OTP generation,
// hashing, storage, and verification entirely (see lib/otp.ts); Termii is
// just the delivery channel, never sees or manages a code.
//
// TERMII_API_KEY is read from process.env and never sent to, or readable
// by, the client — this file is only ever imported from server-side code
// (API routes), matching the required architecture:
//   FindIt app -> FindIt backend (this file) -> Termii -> user's phone
// Never import this file from a "use client" component.
//
// This feature is fully optional and off until TERMII_API_KEY is set: no
// key configured means isSmsConfigured() is false, and the OTP routes skip
// the phone-verification gate entirely rather than locking everyone out —
// this sandbox has no network access to termii.com to test against, so the
// feature is designed to fail open into "not required" rather than risk
// breaking real signups on a misconfigured or unreachable provider.
const DEFAULT_BASE_URL = "https://v4.api.termii.com";
const SEND_TIMEOUT_MS = 10_000;

export function isSmsConfigured(): boolean {
  return Boolean(process.env.TERMII_API_KEY);
}

function requireApiKey(): string {
  const key = process.env.TERMII_API_KEY;
  if (!key) throw new Error("TERMII_API_KEY is not set");
  return key;
}

function baseUrl(): string {
  return process.env.TERMII_BASE_URL || DEFAULT_BASE_URL;
}

// Never crashes the auth server on a Termii outage or slow response — a
// network error, non-2xx response, or timeout all surface as a plain Error
// for the caller (the OTP send route) to turn into a safe, generic message.
export async function sendSms(phoneE164: string, message: string): Promise<void> {
  const apiKey = requireApiKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/api/sms/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        api_key: apiKey,
        to: toTermiiRecipient(phoneE164),
        from: process.env.TERMII_SENDER_ID || "N-Alert",
        sms: message,
        type: "plain",
        // "dnd" (Termii's transactional route) — required for OTP/account
        // messages; the "generic" route is for promotional SMS only and
        // Termii can reject or throttle transactional traffic sent there.
        channel: "dnd",
      }),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    console.error("[sms] Termii request failed", timedOut ? "timeout" : err);
    throw new Error(timedOut ? "Sending the code timed out" : "Couldn't reach the SMS provider");
  } finally {
    clearTimeout(timeout);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Log Termii's response for our own debugging, but never let it (or
    // any part of this request) leak toward the client — see
    // app/api/auth/send-otp/route.ts, which only ever returns a generic
    // "couldn't send" message on failure.
    console.error("[sms] Termii send failed", res.status, data);
    throw new Error("Termii declined the SMS send");
  }
}
