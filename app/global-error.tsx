"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// The ONE error boundary app/error.tsx can't cover: a crash in the ROOT
// layout itself (app/layout.tsx) or in metadata/module-level code that runs
// before the normal component tree even mounts — exactly the class of bug
// that caused a real production incident (a malformed APP_URL crashing
// new URL() at module scope in the root layout, see git history). Next.js
// requires this file to render its own complete <html>/<body> since it
// fully replaces the root layout when it fires, so it can't assume
// globals.css or any other root-layout output loaded successfully —
// inline styles only, nothing that depends on the Tailwind build.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[unhandled root error]", error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#FAFAFF", fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 32px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
              background: "linear-gradient(135deg,#A855F7,#7C3AED)",
            }}
          >
            <span style={{ color: "#fff", fontSize: 28, fontWeight: 700 }}>!</span>
          </div>
          <h1 style={{ fontSize: 19, fontWeight: 700, color: "#1E1B4B", marginBottom: 8 }}>
            FindIt hit a snag
          </h1>
          <p style={{ fontSize: 13, color: "#6B6483", maxWidth: 280, marginBottom: 24, lineHeight: 1.5 }}>
            Something went wrong loading the app. Your account and data are fine — try again.
          </p>
          <button
            onClick={reset}
            style={{
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              padding: "12px 24px",
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              background: "linear-gradient(135deg,#A855F7,#7C3AED)",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
