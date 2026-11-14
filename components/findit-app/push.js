"use client";

// Turning phone/desktop alerts on and off for this browser
// (app/api/push, public/sw.js). Everything here fails quietly: alerts are
// an extra, never something that can break the app.

// ---- In the FindIt Android app: phone notifications through Firebase -------------------------
// The app's WebView has no web push, so the app's own notifications are used instead. Only when
// the build includes Firebase (FindIt.pushReady) and the server can send (FCM_SERVICE_ACCOUNT).
function inApp() {
  return typeof navigator !== "undefined" && /FindItAndroid/.test(navigator.userAgent);
}
function nativePlugins() {
  const P = typeof window !== "undefined" ? window.Capacitor?.Plugins : null;
  return P?.PushNotifications && P?.FindIt ? { Push: P.PushNotifications, FindIt: P.FindIt } : null;
}
const TOKEN_KEY = "findit:appPushToken";
function storedToken() {
  try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function storeToken(t) {
  try { t ? window.localStorage.setItem(TOKEN_KEY, t) : window.localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}
async function nativeAvailable() {
  const n = inApp() && nativePlugins();
  if (!n) return null;
  try {
    const [{ ready }, { enabled }] = await Promise.all([
      n.FindIt.pushReady(),
      fetch("/api/push/device").then((r) => r.json()),
    ]);
    return ready && enabled ? n : null;
  } catch {
    return null;
  }
}
// Registers with Firebase and resolves with this phone's token (or rejects after 15s).
function nativeToken(Push) {
  return new Promise((resolve, reject) => {
    let done = false;
    const subs = [];
    const finish = (fn, v) => {
      if (done) return;
      done = true;
      subs.forEach((p) => Promise.resolve(p).then((s) => s?.remove?.()));
      fn(v);
    };
    subs.push(Push.addListener("registration", (t) => finish(resolve, t?.value)));
    subs.push(Push.addListener("registrationError", (e) => finish(reject, new Error(e?.error || "Couldn't register this phone."))));
    setTimeout(() => finish(reject, new Error("This phone didn't answer. Try again.")), 15000);
    Promise.resolve(Push.register()).catch((e) => finish(reject, e));
  });
}
async function sendToken(token) {
  const res = await fetch("/api/push/device", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't turn on alerts.");
}

// Tapping a FindIt notification opens the page it's about. Call once when the app starts.
export function handleNotificationTaps() {
  const n = inApp() && nativePlugins();
  if (!n) return () => {};
  let sub = null;
  let removed = false;
  Promise.resolve(
    n.Push.addListener("pushNotificationActionPerformed", (a) => {
      const url = a?.notification?.data?.url;
      if (typeof url === "string" && url.startsWith("/")) window.location.href = url;
    })
  ).then((s) => {
    sub = s;
    if (removed) s?.remove?.();
  });
  return () => {
    removed = true;
    sub?.remove?.();
  };
}

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

// iPhones only allow alerts for web apps added to the home screen.
export function needsHomeScreenOnIos() {
  if (typeof window === "undefined") return false;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
  return ios && !standalone;
}

async function registration() {
  return navigator.serviceWorker.register("/sw.js");
}

function keyToBytes(base64) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// "on" | "off" | "blocked" (the person said no in the browser) | "unavailable"
export async function pushState() {
  if (inApp()) {
    const n = await nativeAvailable();
    if (!n) return "unavailable";
    try {
      const { receive } = await n.Push.checkPermissions();
      if (receive === "denied") return "blocked";
      return receive === "granted" && storedToken() ? "on" : "off";
    } catch {
      return "unavailable";
    }
  }
  try {
    if (!pushSupported()) return "unavailable";
    const { publicKey } = await fetch("/api/push").then((r) => r.json());
    if (!publicKey) return "unavailable";
    if (Notification.permission === "denied") return "blocked";
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = reg && (await reg.pushManager.getSubscription());
    return sub && Notification.permission === "granted" ? "on" : "off";
  } catch {
    return "unavailable";
  }
}

// Asks the browser's permission, then sends this account's alerts here.
// Returns the new state.
export async function turnOnPush() {
  if (inApp()) {
    const n = await nativeAvailable();
    if (!n) return "unavailable";
    const { receive } = await n.Push.requestPermissions();
    if (receive !== "granted") return receive === "denied" ? "blocked" : "off";
    await Promise.resolve(
      n.Push.createChannel?.({ id: "findit_alerts", name: "FindIt alerts", description: "Orders, messages, payments and requests", importance: 4, visibility: 1 })
    ).catch(() => {});
    const token = await nativeToken(n.Push);
    await sendToken(token);
    storeToken(token);
    return "on";
  }
  if (!pushSupported()) return "unavailable";
  const { publicKey } = await fetch("/api/push").then((r) => r.json());
  if (!publicKey) return "unavailable";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }));
  const res = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't turn on alerts.");
  return "on";
}

// Stops alerts to this browser. tellServer=false when the session is already
// gone: unsubscribing alone kills the endpoint, and the server forgets it
// the next time it tries to send.
export async function turnOffPush({ tellServer = true } = {}) {
  if (inApp()) {
    const token = storedToken();
    if (!token) return;
    if (tellServer) {
      await fetch("/api/push/device", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }).catch(() => {});
    }
    storeToken(null);
    return;
  }
  try {
    if (!pushSupported()) return;
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = reg && (await reg.pushManager.getSubscription());
    if (!sub) return;
    if (tellServer) {
      await fetch("/api/push", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {});
    }
    await sub.unsubscribe();
  } catch {
    // best-effort
  }
}

// After signing in: if this browser already gets alerts, make them this
// account's (a phone shared between two people, or signing back in).
export async function reattachPush() {
  if (inApp()) {
    const token = storedToken();
    if (token) await sendToken(token).catch(() => {});
    return;
  }
  try {
    if (!pushSupported() || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = reg && (await reg.pushManager.getSubscription());
    if (!sub) return;
    await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
  } catch {
    // best-effort
  }
}
