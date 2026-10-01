"use client";

import { useEffect, useRef, useState } from "react";
import { MotionConfig, AnimatePresence } from "motion/react";
import Splash from "./Splash";
import Welcome from "./Welcome";
import Login from "./Login";
import MainApp from "./MainApp";
import ToastHost from "./Toast";
import { api, setSessionExpiredHandler } from "./api";
import { mergeGuestCartIntoUser } from "./cart";

export default function App() {
  // Just the splash → main handoff now — browsing itself was never
  // supposed to need an account (see requireAuth below), so there's no
  // "welcome"/"login" phase that gates reaching MainApp anymore. Those two
  // screens still exist, just as an on-demand overlay (authPrompt, below)
  // triggered by the handful of actions that actually need one.
  const [phase, setPhase] = useState("splash"); // splash → main
  const [user, setUser] = useState(null);
  // null = no overlay. "welcome" = the Get Started / I already have an
  // account choice. "login" = the actual phone+password (or OTP, for a new
  // signup) form. Rendered ON TOP of MainApp, not swapped in for it, so a
  // guest mid-checkout who gets asked to log in never loses their screen,
  // scroll position, or cart — MainApp simply never unmounts for this.
  const [authPrompt, setAuthPrompt] = useState(null);
  // Which of Login's own modes (its `mode` state, default "login") to open
  // into — set by which of Welcome's two buttons was tapped, so "Get
  // Started" and "I already have an account" actually lead somewhere
  // different instead of both landing on the same screen.
  const [loginMode, setLoginMode] = useState("login");
  const sessionRef = useRef(null);
  // Products/orders/notifications for a returning, already-signed-in user —
  // kicked off as soon as the session check below resolves, so it overlaps
  // the splash screen's own display time instead of only starting once
  // MainApp mounts (i.e. strictly after the splash has already finished).
  // Without this, every refresh showed the branded splash, then a SECOND,
  // separate "Loading FindIt…" spinner stacked right after it while MainApp
  // fetched its own data from scratch — most noticeable on a slower
  // connection. See MainApp.jsx's preloadedMainData prop. Never set at all
  // for a guest — nothing to preload before there's an account.
  const mainDataRef = useRef(null);

  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);
  const showToast = (message, tone = "success") => {
    const id = ++toastIdRef.current;
    setToasts((ts) => [...ts, { id, message, tone }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 3500);
  };
  const dismissToast = (id) => setToasts((ts) => ts.filter((t) => t.id !== id));

  useEffect(() => {
    const sessionPromise = api.me().catch(() => null);
    sessionRef.current = sessionPromise;
    sessionPromise.then((sessionUser) => {
      if (sessionUser) {
        mainDataRef.current = Promise.all([api.getProducts(), api.getOrders(), api.getNotifications()]);
      }
    });
  }, []);

  // A session can lapse while someone is mid-way through the app. Without
  // this they'd just see a generic failure on every tap and keep looking at
  // data they can no longer act on, with no idea they'd been signed out.
  const userRef = useRef(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      // Several in-flight requests can each come back 401 at once — react to
      // the first and ignore the rest, so this only fires once.
      if (!userRef.current) return;
      userRef.current = null;
      sessionRef.current = Promise.resolve(null);
      // Same reasoning as handleLogout — this is a separate logout path
      // (triggered by any 401) that must not leave the departed account's
      // preloaded orders/notifications sitting in mainDataRef for
      // whoever's signed into this device next.
      mainDataRef.current = null;
      setUser(null);
      // Whoever this was already has an account — never reopen Login on
      // whatever mode a much earlier "Get Started" tap left `loginMode` in.
      setLoginMode("login");
      showToast("Your session expired — you're browsing as a guest again. Log in to pick up where you left off.", "error");
      // Deliberately NOT forcing the auth overlay open here — they drop
      // back to guest browsing (MainApp remounts guest-scoped, see its
      // user?.id-keyed `key` below) and only see Login again if they
      // attempt something that actually needs it, same as any other guest.
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  const handleSplashDone = async () => {
    const sessionUser = await sessionRef.current;
    if (sessionUser) setUser(sessionUser);
    setPhase("main"); // always — browsing needs no account, guest or not
  };

  // The one place anything in MainApp asks for an account. Always opens on
  // Welcome's choice first, never straight into a form, so "why am I being
  // asked this" has an obvious, dismissible answer rather than a form
  // appearing out of nowhere over whatever they were doing.
  const requireAuth = () => setAuthPrompt("welcome");

  const handleGetStarted = () => {
    setLoginMode("signup");
    setAuthPrompt("login");
  };

  const handleHaveAccount = () => {
    setLoginMode("login");
    setAuthPrompt("login");
  };

  const handleAuthDismiss = () => setAuthPrompt(null);

  const handleAuthDone = (loggedInUser) => {
    // Before React ever sees the new user: by the time MainApp remounts
    // under this user's own cart key (see the `key` below), whatever this
    // guest already added to cart needs to already be sitting there, not
    // about to be overwritten by a fresh empty read. See cart.js.
    mergeGuestCartIntoUser(loggedInUser.id);
    setUser(loggedInUser);
    setAuthPrompt(null);
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // best-effort
    }
    // mainDataRef is a plain ref, not state — nothing else ever clears it.
    // Without this, it keeps holding whichever account's orders/
    // notifications were preloaded when the page first loaded (only set
    // once, for an already-logged-in return visit — see the effect above).
    // The NEXT login in this same tab, by any account, would otherwise
    // pass that stale, already-resolved promise straight into MainApp as
    // preloadedMainData and briefly render a completely different
    // account's real orders and notifications.
    mainDataRef.current = null;
    setUser(null);
    // Same reasoning as the session-expiry handler above — whoever is
    // logging out already has an account. They land back on MainApp as a
    // guest (its key below switches to "guest", forcing exactly the same
    // clean remount this always relied on) rather than being walled off
    // behind Login — logging out doesn't mean they're done browsing.
    setLoginMode("login");
  };

  let content;
  if (phase === "splash") {
    content = <Splash key="splash" onDone={handleSplashDone} />;
  } else {
    content = (
      <MainApp
        // Tied to the signed-in identity (or "guest"), not a static string —
        // this is what makes a login/logout a clean remount rather than a
        // live prop swap. Every per-account isolation guarantee this app
        // already relies on (cart.js, mainDataRef above, and more) was
        // built assuming MainApp mounts fresh on every identity change, not
        // that it stays mounted and just receives a new `user` prop.
        key={user?.id || "guest"}
        user={user}
        onLogout={handleLogout}
        onRequireAuth={requireAuth}
        showToast={showToast}
        onUserUpdate={(updatedUser) => setUser(updatedUser)}
        preloadedMainData={mainDataRef.current}
      />
    );
  }

  return (
    // reducedMotion="user" makes every motion.* animation in the app defer
    // to the OS-level prefers-reduced-motion preference automatically —
    // one place enforces this rather than every animated component
    // needing its own check.
    <MotionConfig reducedMotion="user">
      {/* Every screen in this app is built as a phone-width layout using
          `fixed inset-0` panels (full-screen overlays, the bottom tab bar,
          toasts) — there was never a tablet/desktop treatment, so on a wider
          browser window those panels used to span the ENTIRE viewport edge
          to edge, stretching a 2-column product grid into two absurdly wide
          cards. Below `md`, this wrapper is a no-op (full width, no visible
          backdrop) — mobile is pixel-identical to before. At `md` and up, it
          centers the app as a fixed-width "device" on a neutral backdrop,
          like visiting a mobile-only site on desktop Chrome's device toolbar.
          `contain: layout` is what makes this actually work: it's the
          standards way to make THIS div (not the real browser viewport) the
          containing block for every `position: fixed` descendant — see
          https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment —
          so every one of those fixed panels anywhere in the app lines up
          with the frame's edges instead of the real window's. */}
      <div className="min-h-screen md:bg-[#EDEAF6] md:py-8">
        {/* Below `md` this is a no-op (full width, `min-h-screen`, normal
            page scroll, no visible backdrop) — mobile is pixel-identical to
            before. At `md`+, this becomes a fixed-size "device frame":
            `[contain:layout]` makes THIS div (not the real browser
            viewport) the containing block for every `position: fixed`
            descendant anywhere in the app (the bottom tab bar, full-screen
            overlays, toasts) — see
            https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment.
            Critically, `overflow-y-auto` has to live on this SAME element,
            not an ancestor: a `fixed` descendant of a `[contain:layout]`
            box is positioned relative to that box's own visible scrollport,
            not its full (scrolled) content — so making this div both the
            containment root AND the one that actually scrolls is what keeps
            the tab bar/overlays correctly pinned to the frame's edges while
            its content scrolls, instead of scrolling away with the page (a
            real regression this fix went through and caught — contain
            without a matching overflow on the same element silently breaks
            every `fixed bottom-0`/`inset-0` element the moment a screen's
            content is taller than one viewport, which is the normal case).
            min-h-screen stays the floor even at md+: every screen here is
            `fixed inset-0`, which has no height of its own, so if this div's
            own height were ever allowed to collapse, every one of them would
            size relative to a zero-height box. */}
        <div
          className="relative min-h-screen md:h-[calc(100vh-4rem)] md:max-w-[480px] md:mx-auto md:overflow-y-auto md:rounded-[28px] md:shadow-2xl md:shadow-[#4C1D95]/20 md:[contain:layout]"
        >
          <ToastHost toasts={toasts} onDismiss={dismissToast} />
          {/* splash -> main is the only one-way, one-time transition left — a
              coordinated crossfade here instead of an instant cut, matching the
              same treatment MainApp's own internal screen switcher already has. */}
          <AnimatePresence mode="wait">{content}</AnimatePresence>
          {/* The auth overlay sits OUTSIDE that AnimatePresence on purpose — it
              layers on top of MainApp rather than replacing it, so opening or
              dismissing it is never a "screen transition" that could touch
              MainApp's own mount lifecycle. */}
          <AnimatePresence>
            {authPrompt === "welcome" && (
              <Welcome key="welcome" onGetStarted={handleGetStarted} onHaveAccount={handleHaveAccount} onDismiss={handleAuthDismiss} />
            )}
            {authPrompt === "login" && (
              <Login key="login" initialMode={loginMode} onDone={handleAuthDone} showToast={showToast} onDismiss={handleAuthDismiss} />
            )}
          </AnimatePresence>
        </div>
      </div>
    </MotionConfig>
  );
}
