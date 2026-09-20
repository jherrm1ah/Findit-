// The cart lives only on this device — no server table, no cross-device
// sync. Same try/catch-wrapped localStorage pattern as
// location.js#getStoredLocation / App.jsx#hasSeenOnboarding. Checkout still
// creates real server-side orders (one per line, via the same createOrder
// call a direct "Buy now" already makes) — this is just the staging list
// before that happens.

const STORAGE_KEY = "findit_cart";

// { productId: string, qty: number, addedAt: number }[]
export function getStoredCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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

export function storeCart(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // best-effort — private browsing / storage blocked, cart still works for this tab via React state
  }
}
