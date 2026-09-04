"use client";

import { useEffect, useRef, useState } from "react";
import Splash from "./Splash";
import Onboarding from "./Onboarding";
import Login from "./Login";
import MainApp from "./MainApp";
import { api } from "./api";

export default function App() {
  const [phase, setPhase] = useState("splash"); // splash → onboarding → login → main
  const [user, setUser] = useState(null);
  const sessionRef = useRef(null);

  useEffect(() => {
    sessionRef.current = api.me().catch(() => null);
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

  if (phase === "splash") return <Splash onDone={() => setPhase("onboarding")} />;
  if (phase === "onboarding") return <Onboarding onDone={goToMainOrLogin} />;
  if (phase === "login")
    return (
      <Login
        onDone={(loggedInUser) => {
          setUser(loggedInUser);
          setPhase("main");
        }}
      />
    );
  return <MainApp user={user} onLogout={handleLogout} />;
}
