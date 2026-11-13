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
