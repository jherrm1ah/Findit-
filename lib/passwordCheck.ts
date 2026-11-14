import crypto from "crypto";
import { ValidationError } from "./repo";

// Refuses passwords that have shown up in known data breaches (the same protection Supabase's
// "leaked password protection" gives apps that use Supabase sign-in; FindIt has its own).
// Uses Have I Been Pwned's range API with k-anonymity: only the first 5 characters of the
// password's SHA-1 hash leave the server, never the password or its full hash. If the check
// can't be reached it lets the password through rather than blocking sign-up.
const RANGE_URL = "https://api.pwnedpasswords.com/range/";
const TIMEOUT_MS = 2500;

export async function timesPasswordBreached(password: string): Promise<number | null> {
  const hash = crypto.createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(RANGE_URL + prefix, {
      headers: { "Add-Padding": "true", "User-Agent": "FindIt-password-check" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const text = await res.text();
    for (const line of text.split("\n")) {
      const [s, count] = line.trim().split(":");
      if (s === suffix) return parseInt(count, 10) || 0;
    }
    return 0;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Every place a password is set (sign up, change, reset) goes through this.
export async function assertPasswordAllowed(password: string, label = "Password"): Promise<void> {
  if (!password || password.length < 8) {
    throw new ValidationError(`${label} must be at least 8 characters.`);
  }
  if (password.length > 200) {
    throw new ValidationError(`${label} is too long.`);
  }
  const breached = await timesPasswordBreached(password);
  if (breached && breached > 0) {
    throw new ValidationError("That password has appeared in a data leak, so it isn't safe. Choose a different one.");
  }
}
