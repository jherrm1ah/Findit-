"use client";

import { useEffect } from "react";

// Catches any error thrown while rendering the app tree (a bug in a screen
// component, an unexpected response shape, etc.) and shows something
// branded and recoverable instead of Next's raw default error page. This
// is a last resort — individual screens should handle their own expected
// failure states (empty lists, failed fetches) well before this ever fires.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[unhandled error]", error);
  }, [error]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center px-8 text-center bg-[#FAFAFF]">
      <div
        className="w-16 h-16 rounded-[20px] flex items-center justify-center mb-5"
        style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
      >
        <span className="text-white text-[28px] font-bold" style={{ fontFamily: "Fraunces, serif" }}>!</span>
      </div>
      <h1 className="text-[19px] font-bold text-[#1E1B4B] mb-2" style={{ fontFamily: "Fraunces, serif" }}>
        Something went wrong
      </h1>
      <p className="text-[13px] text-[#6B6483] max-w-[280px] mb-6">
        FindIt hit an unexpected error. Your account and data are fine — try again.
      </p>
      <button
        onClick={reset}
        className="text-white text-[13px] font-semibold px-6 py-3 rounded-xl shadow-lg shadow-[#7C3AED]/25"
        style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
      >
        Try again
      </button>
    </div>
  );
}
