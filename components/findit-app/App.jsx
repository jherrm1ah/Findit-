"use client";

import { useEffect, useRef, useState } from "react";
import Splash from "./Splash";
import Onboarding from "./Onboarding";
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
  const [phase, setPhase] = useState("splash"); // splash → onboarding → login → main
  const [user, setUser] = useState(null);
  const sessionRef = useRef(null);

  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);
  const showToast = (message, tone = "success") => {
    const id = ++toastIdRef.current;
    setToasts((ts) => [...ts, { id, message, tone }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 3500);
  };
  const dismissToast = (id) => setToasts((ts) => ts.filter((t) => t.id !== id));

  useEffect(() => {
    sessionRef.current = api.me().catch(() => null);
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
      setUser(null);
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

  const handleOnboardingDone = () => {
    markOnboardingSeen();
    goToMainOrLogin();
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // best-effort
    }
    setUser(null);
    setPhase("login");
  };

  let content;
  if (phase === "splash") {
    content = <Splash onDone={handleSplashDone} />;
  } else if (phase === "onboarding") {
    content = <Onboarding onDone={handleOnboardingDone} />;
  } else if (phase === "login") {
    content = (
      <Login
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
        user={user}
        onLogout={handleLogout}
        showToast={showToast}
        onUserUpdate={(updatedUser) => setUser(updatedUser)}
      />
    );
  }

  return (
    <>
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
      {content}
    </>
  );
}
