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
