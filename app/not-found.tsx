import Link from "next/link";

// Next's file-convention 404 — catches both an unmatched URL and every
// explicit notFound() call (app/store/[slug] for an unknown/suspended/
// rejected slug, app/verify/[code] for an unknown/malformed code). Without
// this file, both fell through to Next's own generic, unbranded "This page
// could not be found" — the one gap left after app/error.tsx and
// app/global-error.tsx already covered the 500/crash cases with FindIt's
// own look.
export default function NotFound() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center px-8 text-center bg-[#FAFAFF]">
      <div
        className="w-16 h-16 rounded-[20px] flex items-center justify-center mb-5"
        style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
      >
        <span className="text-white text-[19px] font-bold" style={{ fontFamily: "Fraunces, serif" }}>?</span>
      </div>
      <h1 className="text-[19px] font-bold text-[#1E1B4B] mb-2" style={{ fontFamily: "Fraunces, serif" }}>
        We couldn't find that
      </h1>
      <p className="text-[13px] text-[#6B6483] max-w-[280px] mb-6">
        This page, store, or link doesn't exist — or it's no longer available.
      </p>
      <Link
        href="/"
        className="text-white text-[13px] font-semibold px-6 py-3 rounded-xl shadow-lg shadow-[#7C3AED]/25"
        style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
      >
        Back to FindIt
      </Link>
    </div>
  );
}
