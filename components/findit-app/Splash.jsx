"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import { MapPin } from "lucide-react";
import { DURATION, EASE } from "./motion";

// The launch screen, drawn in code (no image): FindIt's mark, its wordmark and one line on what it
// does, on a soft violet wash, with a thin bar that fills while the app gets ready. Being code, it
// stays sharp on any screen size or shape, can't be cropped, and appears instantly instead of
// waiting for a picture to download. Tap anywhere to skip.
//
// The entrance is plain CSS animation, not JavaScript, so the splash shows the moment the page
// arrives, even on a slow phone before the app's code has loaded (content that waits for
// JavaScript to fade in shows a blank wash until then). transform/opacity only, cheap on low-end
// Android, and switched off for people who ask their phone for reduced motion.
const CSS = `
@keyframes fi-pop { from { opacity: 0; transform: scale(.82) } to { opacity: 1; transform: none } }
@keyframes fi-rise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
@keyframes fi-ring { 0% { opacity: 0; transform: scale(1) } 35% { opacity: .8 } 100% { opacity: 0; transform: scale(1.45) } }
@keyframes fi-fill { from { transform: scaleX(0) } to { transform: scaleX(1) } }
.fi-pop { animation: fi-pop .4s cubic-bezier(.22,1,.36,1) both }
.fi-rise { animation: fi-rise .4s cubic-bezier(.22,1,.36,1) both }
.fi-ring { animation: fi-ring 1.2s cubic-bezier(.22,1,.36,1) .25s both }
.fi-fill { transform-origin: left; animation: fi-fill 1.7s cubic-bezier(.4,0,.2,1) both }
@media (prefers-reduced-motion: reduce) { .fi-pop, .fi-rise, .fi-fill { animation: none } .fi-ring { display: none } }
`;

const SPLASH_MS = 1800;

export default function Splash({ onDone }) {
  useEffect(() => {
    const doneTimer = setTimeout(onDone, SPLASH_MS);
    return () => clearTimeout(doneTimer);
  }, [onDone]);

  return (
    <motion.div
      onClick={onDone}
      exit={{ opacity: 0 }}
      transition={{ duration: DURATION.base, ease: EASE }}
      className="fixed inset-0 z-50 cursor-pointer flex flex-col items-center justify-center overflow-hidden select-none"
      style={{ background: "radial-gradient(120% 70% at 50% 42%, #FFFFFF 0%, #FAFAFF 45%, #F3F0FF 100%)" }}
      role="img"
      aria-label="FindIt"
    >
      {/* Two very soft circles in the corners, the same idea as the old artwork, drawn in CSS. */}
      <div aria-hidden className="absolute -top-28 -left-28 w-72 h-72 rounded-full" style={{ background: "radial-gradient(circle, rgba(167,139,250,.18) 0%, rgba(167,139,250,0) 70%)" }} />
      <div aria-hidden className="absolute -bottom-32 -right-24 w-80 h-80 rounded-full" style={{ background: "radial-gradient(circle, rgba(124,58,237,.14) 0%, rgba(124,58,237,0) 70%)" }} />

      <style>{CSS}</style>
      <div className="relative flex flex-col items-center px-8 text-center">
        {/* The mark: a location pin in a violet app-icon square, with one soft ring easing out. */}
        <div className="relative mb-6">
          <div aria-hidden className="fi-ring absolute inset-0 rounded-[26px]" style={{ border: "2px solid rgba(124,58,237,.35)" }} />
          <div
            className="fi-pop relative w-[84px] h-[84px] rounded-[26px] flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #A855F7 0%, #7C3AED 48%, #4C1D95 100%)",
              boxShadow: "0 18px 40px -12px rgba(76,29,149,.55), inset 0 1px 0 rgba(255,255,255,.25)",
            }}
          >
            <MapPin size={40} strokeWidth={2.2} className="text-white" />
          </div>
        </div>

        <h1
          className="fi-rise text-[40px] leading-none font-bold tracking-[-0.02em]"
          style={{ fontFamily: "Fraunces, serif", animationDelay: ".12s" }}
        >
          <span style={{ color: "#1E1B4B" }}>Find</span>
          <span style={{ background: "linear-gradient(90deg,#A855F7,#7C3AED)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>It</span>
        </h1>

        <p
          className="fi-rise mt-3 text-[14.5px] leading-snug text-[#6B6483] max-w-[260px]"
          style={{ fontFamily: "'Work Sans', sans-serif", animationDelay: ".24s" }}
        >
          Tell us what you need. Verified sellers come to you.
        </p>
      </div>

      {/* A thin bar that fills over the time the splash is up, so it reads as "getting ready". */}
      <div
        aria-hidden
        className="absolute left-1/2 -translate-x-1/2 w-[120px] h-[3px] rounded-full overflow-hidden"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 56px)", background: "rgba(124,58,237,.12)" }}
      >
        <div className="fi-fill h-full rounded-full" style={{ background: "linear-gradient(90deg,#A855F7,#7C3AED)" }} />
      </div>
    </motion.div>
  );
}
