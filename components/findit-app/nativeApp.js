"use client";

// FindIt's Android app (capacitor.config.json) opens this website with
// "FindItAndroid" added to the browser's user agent. In the app, Android's own
// launch screen (the FindIt logo) stays up until FindIt is ready to use, so
// the website skips its own splash there instead of showing a second one.

export function inFindItApp() {
  return typeof navigator !== "undefined" && /FindItAndroid/.test(navigator.userAgent);
}

// Takes down the app's launch screen. Does nothing on the website. If it's
// never called, the app takes it down by itself after a few seconds.
export function hideNativeSplash() {
  try {
    window.Capacitor?.Plugins?.SplashScreen?.hide?.({ fadeOutDuration: 200 });
  } catch {
    // nothing to do
  }
}

// Shares a link with the phone's own share sheet (WhatsApp, Instagram, SMS...).
// In the Android app the website's navigator.share doesn't exist (Android's
// WebView doesn't support it), so it uses the app's Share plugin. Falls back to
// copying the link. Returns "shared", "copied", "cancelled" or "failed".
export async function shareLink({ title, text, url }) {
  try {
    const nativeShare = window.Capacitor?.Plugins?.Share;
    if (inFindItApp() && nativeShare?.share) {
      await nativeShare.share({ title, text, url, dialogTitle: title });
      return "shared";
    }
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title, text, url });
      return "shared";
    }
  } catch (err) {
    // Closing the share sheet without picking an app isn't an error.
    if (/cancel|abort/i.test(String(err?.name || "") + String(err?.message || ""))) return "cancelled";
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}

// True when a share sheet is available (the app, or a browser with Web Share).
export function canShareNatively() {
  if (typeof window === "undefined") return false;
  return Boolean((inFindItApp() && window.Capacitor?.Plugins?.Share) || navigator.share);
}

// The phone's back button in the Android app. `handler` returns true when it
// went back inside FindIt; false means there was nowhere to go, so the app
// closes (Android's normal behaviour on the first screen). Returns a cleanup
// function. Does nothing on the website, where the browser's back is used.
export function onNativeBack(handler) {
  const App = typeof window !== "undefined" && inFindItApp() ? window.Capacitor?.Plugins?.App : null;
  if (!App?.addListener) return () => {};
  let sub = null;
  let removed = false;
  Promise.resolve(
    App.addListener("backButton", () => {
      let handled = false;
      try {
        handled = handler() === true;
      } catch {
        handled = false;
      }
      if (!handled) App.exitApp?.();
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

// FindIt's Play Store page. The rating and update prompts only appear once the listing is live,
// which is switched on by setting NEXT_PUBLIC_PLAY_STORE_LIVE=1 in Vercel (before that the link
// would go nowhere).
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.shopwithfindit.app";
export function playStoreLive() {
  return process.env.NEXT_PUBLIC_PLAY_STORE_LIVE === "1";
}

// The installed app's version ("1.0.4"), or null on the website or if it can't be read.
export async function appVersion() {
  try {
    const App = inFindItApp() ? window.Capacitor?.Plugins?.App : null;
    const info = App?.getInfo ? await App.getInfo() : null;
    return info?.version || null;
  } catch {
    return null;
  }
}

// "1.0.10" vs "1.0.9" compared as numbers. Negative when a < b.
export function compareVersions(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

// Small remembered flags (rating asked, update dismissed). Private windows can refuse storage,
// so every read and write is allowed to fail quietly.
export function remember(key, value) {
  try {
    if (value === undefined) return window.localStorage.getItem(`findit:${key}`);
    window.localStorage.setItem(`findit:${key}`, String(value));
  } catch {
    // nothing to do
  }
  return null;
}

// A FindIt link tapped in another app (WhatsApp, SMS...) opens the Android app, which starts on
// the home page. This sends the app to the link's page instead (an item, a store, a referral).
// Only FindIt's own addresses are followed.
const OWN_HOSTS = ["www.shopwithfindit.com", "shopwithfindit.com"];
function goToOpenedLink(url) {
  try {
    const u = new URL(url);
    if (!OWN_HOSTS.includes(u.hostname)) return;
    const target = `${u.pathname}${u.search}${u.hash}`;
    if (target !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.location.href = target;
    }
  } catch {
    // not a link we can follow
  }
}
export function followOpenedLinks() {
  const App = typeof window !== "undefined" && inFindItApp() ? window.Capacitor?.Plugins?.App : null;
  if (!App?.addListener) return () => {};
  // A link that started the app. Followed once per app launch: the page reload it causes would
  // otherwise read the same launch link again.
  Promise.resolve(App.getLaunchUrl?.())
    .then((r) => {
      if (!r?.url) return;
      try {
        if (window.sessionStorage.getItem("findit:launchUrl") === r.url) return;
        window.sessionStorage.setItem("findit:launchUrl", r.url);
      } catch {
        // storage refused: following it once more is harmless (the page check stops a loop)
      }
      goToOpenedLink(r.url);
    })
    .catch(() => {});
  // A link tapped while the app was already open.
  let sub = null;
  let removed = false;
  Promise.resolve(App.addListener("appUrlOpen", (e) => goToOpenedLink(e?.url))).then((s) => {
    sub = s;
    if (removed) s?.remove?.();
  });
  return () => {
    removed = true;
    sub?.remove?.();
  };
}
