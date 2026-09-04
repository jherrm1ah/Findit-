// Browser geolocation, requested only on explicit user action (never on a
// timer or on page load) and never defaulted to any city. Successful reads
// are cached in localStorage so we don't re-prompt every visit, and synced
// to the account server-side (see api.updateMyLocation) when logged in.

const STORAGE_KEY = "findit_location";

export function getStoredLocation() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.lat === "number" && typeof parsed?.lng === "number") return parsed;
    return null;
  } catch {
    return null;
  }
}

function storeLocation(lat, lng) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lat, lng, updatedAt: Date.now() }));
  } catch {
    // best-effort — private browsing / storage blocked, location still works for this tab
  }
}

// Returns { lat, lng } on success. Rejects with a friendly, typed error the
// UI can show ("denied" | "unavailable" | "unsupported") rather than a raw
// browser error object.
export function requestBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        storeLocation(latitude, longitude);
        resolve({ lat: latitude, lng: longitude });
      },
      (err) => {
        reject(new Error(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"));
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 }
    );
  });
}

export function clearStoredLocation() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
