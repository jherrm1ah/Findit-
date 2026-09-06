// In-memory store tracking phone-verification state during signup. Same
// single-process caveat as lib/rateLimit.ts (a real multi-instance
// deployment would need a shared store) — acceptable here for the same
// reason: this is a short-lived (minutes) ticket, not durable state.
//
// We deliberately never send the Termii pin_id to the client. The client
// only ever sees "code sent" / "verified" — the server is the only thing
// that ever calls Termii's verify endpoint, so a leaked pin_id can't be
// used to brute-force a code from outside our own rate-limited routes.
type Entry = {
  pinId: string;
  createdAt: number;
  verified: boolean;
  verifiedAt: number | null;
};

const PENDING_TTL_MS = 10 * 60 * 1000; // matches Termii pin_time_to_live
const VERIFIED_TTL_MS = 10 * 60 * 1000; // window to complete signup after verifying
const MAX_ENTRIES = 10_000;

const store = new Map<string, Entry>();

function sweep() {
  const now = Date.now();
  for (const [phone, entry] of store) {
    const ttl = entry.verified ? VERIFIED_TTL_MS : PENDING_TTL_MS;
    const since = entry.verified ? entry.verifiedAt! : entry.createdAt;
    if (now - since > ttl) store.delete(phone);
  }
}

export function savePendingOtp(phone: string, pinId: string): void {
  sweep();
  if (store.size >= MAX_ENTRIES && !store.has(phone)) {
    throw new Error("Too many pending verifications — try again shortly.");
  }
  store.set(phone, { pinId, createdAt: Date.now(), verified: false, verifiedAt: null });
}

export function getPendingPinId(phone: string): string | null {
  sweep();
  const entry = store.get(phone);
  if (!entry || entry.verified) return null;
  return entry.pinId;
}

export function markVerified(phone: string): void {
  const entry = store.get(phone);
  if (!entry) return;
  entry.verified = true;
  entry.verifiedAt = Date.now();
}

export function isRecentlyVerified(phone: string): boolean {
  sweep();
  const entry = store.get(phone);
  return Boolean(entry?.verified);
}

export function clearOtp(phone: string): void {
  store.delete(phone);
}
