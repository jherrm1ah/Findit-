import { NextRequest } from "next/server";

// In-memory sliding-window limiter. Good enough for this single-process app
// — a real multi-instance deployment would need a shared store (Redis) so
// limits are enforced across instances, not per-process.
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

export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number
): { allowed: boolean; retryAfterSeconds: number } {
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
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.ip || "unknown";
}
