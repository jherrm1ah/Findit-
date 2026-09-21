// The cart lives only on this device — no server table, no cross-device
// sync. Same try/catch-wrapped localStorage pattern as
// location.js#getStoredLocation / App.jsx#hasSeenOnboarding. Checkout still
// creates real server-side orders (one per line, via the same createOrder
// call a direct "Buy now" already makes) — this is just the staging list
// before that happens.
//
// Keyed by userId, not a single shared key: MainApp.jsx fully unmounts and
// remounts on every logout/login (see App.jsx's phase machinery), so a
// single global key meant the NEXT account signed into on the same device
// loaded whatever the PREVIOUS account had left in their cart — a real
// account signed in right after another one would see items they never
// added. A guest (no session yet) gets its own bucket rather than reusing
// whichever account's key happened to be current.
const STORAGE_KEY_PREFIX = "findit_cart_";

function storageKey(userId) {
  return STORAGE_KEY_PREFIX + (userId || "guest");
}

// { productId: string, qty: number, addedAt: number }[]
export function getStoredCart(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (it) => it && typeof it.productId === "string" && Number.isFinite(it.qty) && it.qty > 0
    );
  } catch {
    return [];
  }
}

export function storeCart(userId, items) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(items));
  } catch {
    // best-effort — private browsing / storage blocked, cart still works for this tab via React state
  }
}
