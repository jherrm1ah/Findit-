"use client";

import { useEffect, useRef, useState } from "react";
import Splash from "./Splash";
import Onboarding from "./Onboarding";
import Login from "./Login";
import MainApp from "./MainApp";
import ToastHost from "./Toast";
import { api, setSessionExpiredHandler } from "./api";

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
    content = <Splash onDone={() => setPhase("onboarding")} />;
  } else if (phase === "onboarding") {
    content = <Onboarding onDone={goToMainOrLogin} />;
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
