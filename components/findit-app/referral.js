// Stashes a referral code picked up from a /ref/[code] link (consumed by
// MainApp.jsx's deep-link effect) so it survives a guest browsing around
// the app before they eventually sign up. One flat key, not per-user like
// location.js/cart.js — there is no user yet when this is written, that's
// the whole point of it existing.
const STORAGE_KEY = "findit_pending_referral_code";

export function storePendingReferralCode(code) {
  try {
    if (code) localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // best-effort — private browsing / storage blocked, the link still
    // opens the app, it just won't carry attribution through signup
  }
}

export function getPendingReferralCode() {
  try {
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

// Cleared once a signup actually consumes it — win or lose, a code is only
// ever good for one attribution attempt per device, not reused across a
// later, unrelated account on the same browser.
export function clearPendingReferralCode() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
