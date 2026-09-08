// Phone number normalization — canonical storage format is E.164
// (+<countrycode><number>, e.g. +2348012345678). Every place that reads or
// writes a phone number (login, signup, OTP, phone change) must go through
// normalizeE164 first, so "08012345678", "2348012345678", and
// "+2348012345678" all resolve to the exact same account/OTP record instead
// of silently being treated as three different phone numbers.
//
// This only has real rules for Nigeria today (FindIt's current market) —
// any input that already looks like a valid E.164 number (starts with "+"
// followed by 8-15 digits) is passed through untouched, which is what lets
// this support a user from another country later without every existing
// call site needing to change: add that country's local-format rule here,
// nothing else has to move. A future rewrite backed by a real phone-number
// library (e.g. libphonenumber) would replace just this file's Nigeria
// branch, not the phone-handling code elsewhere in the app.
const NG_COUNTRY_CODE = "234";

export function normalizeE164(phone: string): string {
  const trimmed = phone.trim();
  const digitsAndPlus = trimmed.replace(/[^\d+]/g, "");

  // Already E.164-shaped (+ followed by 8-15 digits) — trust it as-is.
  if (/^\+\d{8,15}$/.test(digitsAndPlus)) {
    return digitsAndPlus;
  }

  const digitsOnly = digitsAndPlus.replace(/\+/g, "");

  // Nigerian local format: 0 + 10 digits (e.g. 08012345678).
  if (/^0\d{10}$/.test(digitsOnly)) {
    return `+${NG_COUNTRY_CODE}${digitsOnly.slice(1)}`;
  }
  // Nigerian number with the country code but no "+" (e.g. 2348012345678).
  if (digitsOnly.startsWith(NG_COUNTRY_CODE) && digitsOnly.length === 13) {
    return `+${digitsOnly}`;
  }
  // Bare 10-digit local number with no leading 0 (e.g. 8012345678).
  if (/^\d{10}$/.test(digitsOnly)) {
    return `+${NG_COUNTRY_CODE}${digitsOnly}`;
  }

  // Doesn't match a known shape — return the digits with a leading "+"
  // rather than throwing, so validation (length checks) happens at the
  // call site the same way it already does; this just guarantees the
  // *same* malformed input always normalizes to the same string.
  return `+${digitsOnly}`;
}

// Nigerian-format display (+2348012345678 -> 08012345678) — used only in
// the couple of places the UI shows a phone number back to its owner.
// Falls back to the raw E.164 string for any number this doesn't
// recognize as Nigerian, rather than mangling it.
export function formatPhoneLocal(e164: string): string {
  if (e164.startsWith(`+${NG_COUNTRY_CODE}`) && e164.length === 14) {
    return `0${e164.slice(1 + NG_COUNTRY_CODE.length)}`;
  }
  return e164;
}

// Termii's API examples show recipient numbers without a leading "+".
export function toTermiiRecipient(e164: string): string {
  return e164.replace(/^\+/, "");
}
