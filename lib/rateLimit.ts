import { NextRequest } from "next/server";
import { getDb } from "./db";

// In-memory sliding-window limiter — now the FALLBACK path only. See
// checkRateLimit at the bottom of this file: the real limiter is a shared
// counter in Postgres (migration 022), because this map is per-process and
// FindIt runs on Vercel, where each request may hit a different serverless
// instance with its own empty copy.
//
// Kept, rather than deleted, so a database problem degrades protection
// instead of locking everyone out of logging in. Per-instance counting is
// weak; no counting at all is worse.
//
// Unbounded growth guard: every distinct key (ip+phone, user id, etc.) adds
// an entry that only gets cleaned up when that same key is checked again.
// A flood of requests using many distinct never-repeated keys (e.g. spoofed
// X-Forwarded-For values, if this app is ever deployed somewhere that
// doesn't overwrite that header with the real client IP before it reaches
// the app) could otherwise grow this map indefinitely — a memory-exhaustion
// DoS vector of its own. MAX_ENTRIES + the periodic sweep bound that.
const attempts = new Map<string, number[]>();
const MAX_ENTRIES = 50_000;
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function sweepExpired(windowMs: number) {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, times] of attempts) {
    const recent = times.filter((t) => now - t < windowMs);
    if (recent.length === 0) attempts.delete(key);
    else attempts.set(key, recent);
  }
}

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export function checkRateLimitInMemory(
  key: string,
  max: number,
  windowMs: number
): RateLimitResult {
  sweepExpired(windowMs);
  if (attempts.size >= MAX_ENTRIES && !attempts.has(key)) {
    // Fail closed rather than let the map grow without bound — an
    // unrecognized key under memory pressure is treated as rate-limited.
    return { allowed: false, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }

  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((t) => now - t < windowMs);

  if (recent.length >= max) {
    const retryAfterSeconds = Math.ceil((windowMs - (now - recent[0])) / 1000);
    attempts.set(key, recent);
    return { allowed: false, retryAfterSeconds };
  }

  recent.push(now);
  attempts.set(key, recent);
  return { allowed: true, retryAfterSeconds: 0 };
}

// NOTE ON TRUST: this reads X-Forwarded-For, which is only trustworthy if
// the platform in front of this app (e.g. Vercel's edge network) sets/
// overwrites it with the real client IP before the request reaches here.
// Self-hosting behind a proxy that doesn't do this would let a client set
// their own X-Forwarded-For and get a fresh rate-limit bucket on every
// request. On Vercel (the deployment target documented in the README)
// this header is set by their edge network and safe to trust.
export function getClientIp(req: NextRequest): string {
  // req.ip is set by the platform itself and cannot be forged by the client,
  // so it is preferred over the header. X-Forwarded-For is the fallback for
  // environments that don't populate req.ip; its first entry is the original
  // client on Vercel, whose edge network overwrites the header.
  const raw = req.ip || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  // Colons separate the segments of every rate-limit key in this codebase
  // ('login:<ip>:<phone>'), and an IPv6 address is full of them. Left as-is,
  // "2001:db8::1" makes a key that a crafted value could also produce, so
  // two different callers could share one bucket — or one caller could aim
  // at someone else's. Normalising the separator out removes the ambiguity.
  // Also caps the length, since the header is attacker-influenced and the
  // key becomes a database primary key.
  return raw.replace(/:/g, "_").slice(0, 100);
}


/* -------------------------------------------------------------------------- */
/*  The real limiter — one shared counter, in Postgres                         */
/* -------------------------------------------------------------------------- */

// Every route's limit goes through here. The counter lives in the
// rate_limits table (migration 022) and is incremented by an atomic
// check_rate_limit() call, so:
//
//   - all serverless instances share one count, instead of each keeping its
//     own and multiplying the real allowance by however many are warm,
//   - a cold start no longer resets anyone's counter to zero,
//   - two simultaneous requests cannot both read the same count and both
//     conclude they are under the limit, because the read and the increment
//     are a single statement.
//
// windowMs is kept in milliseconds to match every existing call site; the
// database function takes seconds.
export async function checkRateLimit(
  key: string,
  max: number,
  windowMs: number
): Promise<RateLimitResult> {
  const windowSeconds = Math.max(1, Math.round(windowMs / 1000));

  try {
    const { data, error } = await getDb().rpc("check_rate_limit", {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) throw new Error(error.message);

    // The function returns a single row; supabase-js gives it as an array.
    const row = (Array.isArray(data) ? data[0] : data) as
      | { allowed: boolean; retry_after_seconds: number }
      | undefined;
    if (!row || typeof row.allowed !== "boolean") {
      throw new Error("check_rate_limit returned an unexpected shape");
    }

    return { allowed: row.allowed, retryAfterSeconds: Number(row.retry_after_seconds) || 0 };
  } catch (err) {
    // Deliberately falls back rather than failing closed. Failing closed
    // here would turn a database hiccup into "nobody can log in", which is a
    // worse outcome than briefly counting per-instance. Logged loudly so it
    // is visible rather than silent — if this appears in production logs,
    // migration 022 probably has not been applied.
    console.error("[rate-limit] shared counter unavailable, falling back to per-instance counting:", err);
    return checkRateLimitInMemory(key, max, windowMs);
  }
}
