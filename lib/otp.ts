import crypto from "crypto";
import { getDb, assertNoError } from "./db";
import { ValidationError } from "./repo";

export type OtpPurpose = "signup" | "reset";

export type OtpConfig = {
  expiryMinutes: number;
  resendCooldownSeconds: number;
  maxAttempts: number;
  maxRequestsPerHour: number;
  maxResends: number;
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getOtpConfig(): OtpConfig {
  return {
    expiryMinutes: envInt("OTP_EXPIRY_MINUTES", 10),
    resendCooldownSeconds: envInt("OTP_RESEND_COOLDOWN_SECONDS", 60),
    maxAttempts: envInt("OTP_MAX_ATTEMPTS", 5),
    maxRequestsPerHour: envInt("OTP_MAX_REQUESTS_PER_HOUR", 5),
    maxResends: envInt("OTP_MAX_RESENDS", 3),
  };
}

// crypto.randomInt is CSPRNG-backed (unlike Math.random), and the modulo
// bias is negligible at this range (1,000,000 divides evenly into the
// generator's output space for randomInt's own rejection-sampling).
export function generateOtpCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

// A 6-digit code only has 1,000,000 possible values, so no hash — however
// strong — makes it resistant to offline brute force if this table ever
// leaks; the real security boundary here is expiry + attempt limits + rate
// limiting, not the hash. The per-record random salt still matters: it
// stops an attacker who *does* get read access from precomputing one
// lookup table of all 1M hashes and reading every user's code out of the
// table in one pass — each row needs its own attack.
export function hashOtpCode(code: string, salt: string): string {
  return crypto.createHmac("sha256", salt).update(code).digest("hex");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export class OtpResendCooldownError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super("Please wait before requesting another code.");
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type Row = Record<string, unknown>;

function randomRecordId(): string {
  return "otp_" + crypto.randomBytes(12).toString("hex");
}

export async function createOtp(input: {
  phone: string;
  purpose: OtpPurpose;
  requestIp: string;
}): Promise<{ id: string; code: string; expiresInSeconds: number; resendAvailableInSeconds: number }> {
  const config = getOtpConfig();
  const db = getDb();
  const now = new Date();

  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const hourlyResult = await db
    .from("otp_verifications")
    .select("id", { count: "exact", head: true })
    .eq("phone", input.phone)
    .eq("purpose", input.purpose)
    .gte("created_at", hourAgo);
  if (hourlyResult.error) {
    throw new Error(`checking OTP request rate: ${hourlyResult.error.message}`);
  }
  if ((hourlyResult.count ?? 0) >= config.maxRequestsPerHour) {
    throw new ValidationError("Too many code requests this hour — try again later.");
  }

  const activeResult = await db
    .from("otp_verifications")
    .select("*")
    .eq("phone", input.phone)
    .eq("purpose", input.purpose)
    .eq("used", false)
    .gt("expires_at", now.toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const active = assertNoError(activeResult, "checking for a pending code") as Row | null;

  const code = generateOtpCode();
  const salt = crypto.randomBytes(16).toString("hex");
  const otpHash = hashOtpCode(code, salt);
  const expiresAt = new Date(now.getTime() + config.expiryMinutes * 60 * 1000);

  if (active) {
    const lastSentAt = new Date(active.last_sent_at as string).getTime();
    const secondsSinceLastSend = (now.getTime() - lastSentAt) / 1000;
    if (secondsSinceLastSend < config.resendCooldownSeconds) {
      throw new OtpResendCooldownError(
        Math.ceil(config.resendCooldownSeconds - secondsSinceLastSend)
      );
    }
    if ((active.resend_count as number) >= config.maxResends) {
      throw new ValidationError(
        "Too many resend attempts — wait for the current code to expire and request a new one."
      );
    }

    const updateResult = await db
      .from("otp_verifications")
      .update({
        otp_hash: otpHash,
        otp_salt: salt,
        expires_at: expiresAt.toISOString(),
        last_sent_at: now.toISOString(),
        resend_count: (active.resend_count as number) + 1,
        attempts: 0,
        used: false,
        request_ip: input.requestIp,
      })
      .eq("id", active.id as string);
    assertNoError(updateResult, "updating verification code");
    return {
      id: active.id as string,
      code,
      expiresInSeconds: config.expiryMinutes * 60,
      resendAvailableInSeconds: config.resendCooldownSeconds,
    };
  }

  const id = randomRecordId();
  const insertResult = await db.from("otp_verifications").insert({
    id,
    phone: input.phone,
    purpose: input.purpose,
    otp_hash: otpHash,
    otp_salt: salt,
    expires_at: expiresAt.toISOString(),
    last_sent_at: now.toISOString(),
    attempts: 0,
    max_attempts: config.maxAttempts,
    resend_count: 0,
    used: false,
    request_ip: input.requestIp,
  });
  assertNoError(insertResult, "creating verification code");

  return {
    id,
    code,
    expiresInSeconds: config.expiryMinutes * 60,
    resendAvailableInSeconds: config.resendCooldownSeconds,
  };
}

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "too_many_attempts" | "incorrect" };

export async function verifyOtp(input: {
  phone: string;
  purpose: OtpPurpose;
  code: string;
}): Promise<VerifyOtpResult> {
  const db = getDb();
  const now = new Date();

  const activeResult = await db
    .from("otp_verifications")
    .select("*")
    .eq("phone", input.phone)
    .eq("purpose", input.purpose)
    .eq("used", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = assertNoError(activeResult, "loading verification code") as Row | null;

  if (!row) return { ok: false, reason: "not_found" };
  if (new Date(row.expires_at as string) <= now) return { ok: false, reason: "expired" };
  if ((row.attempts as number) >= (row.max_attempts as number)) {
    return { ok: false, reason: "too_many_attempts" };
  }

  const candidateHash = hashOtpCode(input.code.trim(), row.otp_salt as string);
  const matches = timingSafeEqualHex(candidateHash, row.otp_hash as string);

  if (!matches) {
    const incrementResult = await db
      .from("otp_verifications")
      .update({ attempts: (row.attempts as number) + 1 })
      .eq("id", row.id as string)
      .eq("used", false);
    assertNoError(incrementResult, "recording verification attempt");
    return { ok: false, reason: "incorrect" };
  }

  // Atomic, conditioned on used = false — under concurrent verify requests
  // for the same code, only one UPDATE can flip used false -> true; the
  // other affects zero rows and is treated as a loss below. This is what
  // stops two simultaneous requests with the same correct code both
  // succeeding.
  const claimResult = await db
    .from("otp_verifications")
    .update({ used: true, verified_at: now.toISOString() })
    .eq("id", row.id as string)
    .eq("used", false)
    .select()
    .maybeSingle();
  const claimed = assertNoError(claimResult, "confirming verification") as Row | null;
  if (!claimed) {
    // Lost the race to a concurrent request that verified first.
    return { ok: false, reason: "incorrect" };
  }
  return { ok: true };
}

// True once a phone has a *used, successfully verified* row for this
// purpose within the last verification window — the ticket signup/reset
// checks before letting the caller complete the account-creation or
// password-reset step. Reuses the same expiry window as the code itself:
// once you've verified, you have that long to finish what you started.
export async function isRecentlyVerified(phone: string, purpose: OtpPurpose): Promise<boolean> {
  const config = getOtpConfig();
  const db = getDb();
  const windowStart = new Date(Date.now() - config.expiryMinutes * 60 * 1000).toISOString();
  const result = await db
    .from("otp_verifications")
    .select("id")
    .eq("phone", phone)
    .eq("purpose", purpose)
    .eq("used", true)
    .gte("verified_at", windowStart)
    .order("verified_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = assertNoError(result, "checking verification status") as Row | null;
  return Boolean(row);
}

export async function clearOtp(phone: string, purpose: OtpPurpose): Promise<void> {
  const result = await getDb()
    .from("otp_verifications")
    .delete()
    .eq("phone", phone)
    .eq("purpose", purpose);
  assertNoError(result, "clearing verification code");
}
