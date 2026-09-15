"use client";

import { useState } from "react";
import App from "@/components/findit-app/App";
import LandingPage from "./LandingPage";

// hasSession is decided server-side (app/page.tsx) from the real session
// cookie, so a returning signed-in visitor's very first paint is already
// the app — no logged-out flash. A first-time/logged-out visitor (and
// every crawler, which never carries a session cookie) sees the real
// marketing content below instead; "Get started" flips this to the app
// client-side, same URL, no navigation.
export default function HomeShell({ hasSession, categories }) {
  const [showApp, setShowApp] = useState(hasSession);

  if (showApp) return <App />;
  return <LandingPage categories={categories} onGetStarted={() => setShowApp(true)} />;
}
