"use client";

// Turning phone/desktop alerts on and off for this browser
// (app/api/push, public/sw.js). Everything here fails quietly: alerts are
// an extra, never something that can break the app.

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
