"use client";

import { useState } from "react";
import Splash from "./Splash";
import Onboarding from "./Onboarding";
import Login from "./Login";
import MainApp from "./MainApp";

export default function App() {
  const [phase, setPhase] = useState("splash"); // splash → onboarding → login → main

  if (phase === "splash") return <Splash onDone={() => setPhase("onboarding")} />;
  if (phase === "onboarding") return <Onboarding onDone={() => setPhase("login")} />;
  if (phase === "login") return <Login onDone={() => setPhase("main")} />;
  return <MainApp />;
}
