"use client";

// "Open instantly": the last home feed is kept on the phone, so the next visit shows it straight
// away while fresh data loads behind it. Listings are public; a signed-in person's orders and
// notifications are stored under their own account id only, and cleared when they sign out, so
// a shared phone never shows one account's data to another. Everything here fails quietly:
// a full or blocked storage just means a normal load.
const VERSION = 1;
const MAX_PRODUCTS = 60;
const MAX_BYTES = 1_500_000;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const key = (userId) => `findit:snapshot:v${VERSION}:${userId || "guest"}`;

export function readSnapshot(userId) {
  try {
    const raw = window.localStorage.getItem(key(userId));
    if (!raw) return null;
    const snap = JSON.parse(raw);
    if (!snap || Date.now() - (snap.savedAt || 0) > MAX_AGE_MS || !Array.isArray(snap.products)) return null;
    return { products: snap.products, orders: Array.isArray(snap.orders) ? snap.orders : [], notifications: Array.isArray(snap.notifications) ? snap.notifications : [] };
  } catch {
    return null;
  }
}

export function saveSnapshot(userId, { products, orders, notifications }) {
  try {
    const data = JSON.stringify({
      savedAt: Date.now(),
      products: (products || []).slice(0, MAX_PRODUCTS),
      orders: userId ? (orders || []).slice(0, 30) : [],
      notifications: userId ? (notifications || []).slice(0, 30) : [],
    });
    if (data.length > MAX_BYTES) return;
    window.localStorage.setItem(key(userId), data);
  } catch {
    // storage full or blocked: nothing to do
  }
}

// Signing out: remove that account's saved orders and notifications from this phone.
export function clearSnapshot(userId) {
  try {
    if (userId) window.localStorage.removeItem(key(userId));
  } catch {
    // nothing to do
  }
}
