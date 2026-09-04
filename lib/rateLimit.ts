import { NextRequest } from "next/server";

// In-memory sliding-window limiter. Good enough for this single-process demo
// app — a real multi-instance deployment would need a shared store (Redis).
const attempts = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number
): { allowed: boolean; retryAfterSeconds: number } {
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

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.ip || "unknown";
}
