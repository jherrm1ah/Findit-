// Browser geolocation, requested only on explicit user action (never on a
// timer or on page load) and never defaulted to any city. Successful reads
// are cached in localStorage so we don't re-prompt every visit, and synced
// to the account server-side (see api.updateMyLocation) when logged in.
//
// Keyed by userId, not a single shared key — same reasoning as cart.js.
// MainApp.jsx's fallback read only kicks in for an account with no location
// of its own saved server-side yet; with a single global key, that account
// would silently inherit whichever OTHER account last granted location on
// this device (shown as "granted", sorting their feed by a place they never
// were, with no prompt ever shown since the status already reads granted).
const STORAGE_KEY_PREFIX = "findit_location_";

function storageKey(userId) {
  return STORAGE_KEY_PREFIX + (userId || "guest");
}

export function getStoredLocation(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.lat === "number" && typeof parsed?.lng === "number") return parsed;
    return null;
  } catch {
    return null;
  }
}

function storeLocation(userId, lat, lng) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify({ lat, lng, updatedAt: Date.now() }));
  } catch {
    // best-effort — private browsing / storage blocked, location still works for this tab
  }
}

// Returns { lat, lng } on success. Rejects with a friendly, typed error the
// UI can show ("denied" | "unavailable" | "unsupported") rather than a raw
// browser error object.
export function requestBrowserLocation(userId) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        storeLocation(userId, latitude, longitude);
        resolve({ lat: latitude, lng: longitude });
      },
      (err) => {
        reject(new Error(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"));
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 }
    );
  });
}

export function clearStoredLocation(userId) {
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    // ignore
  }
}
