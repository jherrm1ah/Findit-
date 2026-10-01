"use client";

import { useEffect, useRef, useState } from "react";
import { MotionConfig, AnimatePresence } from "motion/react";
import Splash from "./Splash";
import Onboarding from "./Onboarding";
import Welcome from "./Welcome";
import Login from "./Login";
import MainApp from "./MainApp";
import ToastHost from "./Toast";
import { api, setSessionExpiredHandler } from "./api";

// Whether this browser has ever clicked through (or skipped) the onboarding
// tutorial — same try/catch-wrapped localStorage pattern as
// location.js#getStoredLocation. Without this, EVERY page refresh forced a
// returning, already-logged-in user back through three manual "Next" taps
// before their session was even checked — indistinguishable, from the
// outside, from being logged out on every reload.
const ONBOARDING_SEEN_KEY = "findit_onboarding_seen";

function hasSeenOnboarding() {
  try {
    return localStorage.getItem(ONBOARDING_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markOnboardingSeen() {
  try {
    localStorage.setItem(ONBOARDING_SEEN_KEY, "1");
  } catch {
    // best-effort — private browsing / storage blocked, just re-shows once
  }
}

export default function App() {
  const [phase, setPhase] = useState("splash"); // splash → onboarding → welcome → login → main
  const [user, setUser] = useState(null);
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
  // connection. See MainApp.jsx's preloadedMainData prop.
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
      // the first and ignore the rest, so this bounces to login once.
      if (!userRef.current) return;
      userRef.current = null;
      sessionRef.current = Promise.resolve(null);
      // Same reasoning as handleLogout — this is a separate logout path
      // (triggered by any 401) that must not leave the departed account's
      // preloaded orders/notifications sitting in mainDataRef for
      // whoever logs in next.
      mainDataRef.current = null;
      setUser(null);
      // Whoever this was already has an account — never reopen Login on
      // whatever mode a much earlier "Get Started" tap left `loginMode` in.
      setLoginMode("login");
      setPhase("login");
      showToast("Your session expired — please log in again.", "error");
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  // A returning user with a live session skips straight past the login screen.
  const goToMainOrLogin = async () => {
    const sessionUser = await sessionRef.current;
    if (sessionUser) {
      setUser(sessionUser);
      setPhase("main");
    } else {
      setPhase("login");
    }
  };

  // Only a browser that has never clicked through (or skipped) onboarding
  // sees it — everyone else goes straight to the session check above, so a
  // returning user's own session (not the tutorial) decides what they see.
  const handleSplashDone = () => {
    if (hasSeenOnboarding()) {
      goToMainOrLogin();
    } else {
      setPhase("onboarding");
    }
  };

  // Distinct from goToMainOrLogin (still used by handleSplashDone and by
  // every later "no session" case — session-expiry, logout): those are a
  // RETURNING visitor's paths, who should never see the first-run "Get
  // Started" choice again just to log back in. This one runs exactly once
  // per device, right after the tutorial, and only for a genuinely new
  // visitor with no live session — an already-signed-in one (session found
  // at the very first page load, tutorial never seen yet either) skips
  // straight to main, same as goToMainOrLogin would.
  const handleOnboardingDone = async () => {
    markOnboardingSeen();
    const sessionUser = await sessionRef.current;
    if (sessionUser) {
      setUser(sessionUser);
      setPhase("main");
    } else {
      setPhase("welcome");
    }
  };

  const handleGetStarted = () => {
    setLoginMode("signup");
    setPhase("login");
  };

  const handleHaveAccount = () => {
    setLoginMode("login");
    setPhase("login");
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
    // logging out already has an account.
    setLoginMode("login");
    setPhase("login");
  };

  let content;
  if (phase === "splash") {
    content = <Splash key="splash" onDone={handleSplashDone} />;
  } else if (phase === "onboarding") {
    content = <Onboarding key="onboarding" onDone={handleOnboardingDone} />;
  } else if (phase === "welcome") {
    content = <Welcome key="welcome" onGetStarted={handleGetStarted} onHaveAccount={handleHaveAccount} />;
  } else if (phase === "login") {
    content = (
      <Login
        key="login"
        initialMode={loginMode}
        onDone={(loggedInUser) => {
          setUser(loggedInUser);
          setPhase("main");
        }}
        showToast={showToast}
      />
    );
  } else {
    content = (
      <MainApp
        key="main"
        user={user}
        onLogout={handleLogout}
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
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
      {/* splash -> onboarding -> login -> main is a one-way, one-time
          sequence (per session/device) — a coordinated crossfade here
          instead of an instant cut, matching the same treatment
          MainApp's own internal screen switcher already has. */}
      <AnimatePresence mode="wait">{content}</AnimatePresence>
    </MotionConfig>
  );
}
