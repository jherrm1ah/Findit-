"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import { DURATION, EASE } from "./motion";

// The launch screen, drawn in code (no image): "Minimal Ink". All white, just the FindIt wordmark
// with a violet location pin as the dot of the "i", a short violet line, and one line on what
// FindIt does. A thin bar along the bottom fills while the app gets ready. Being code, it stays
// sharp on any screen size or shape, can't be cropped, and appears instantly. Tap anywhere to skip.
//
// The entrance is plain CSS animation, not JavaScript, so the splash shows the moment the page
// arrives, even on a slow phone before the app's code has loaded: the name rises in, the pin drops
// onto the "i", the line draws itself. transform/opacity only, cheap on low-end Android, and
// switched off for people who ask their phone for reduced motion.
const CSS = `
@keyframes fi-rise { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
@keyframes fi-drop { 0% { opacity: 0; transform: translate(-50%, -26px) } 60% { opacity: 1; transform: translate(-50%, 3px) } 100% { opacity: 1; transform: translate(-50%, 0) } }
@keyframes fi-draw { from { transform: scaleX(0) } to { transform: scaleX(1) } }
@keyframes fi-fill { from { transform: scaleX(0) } to { transform: scaleX(1) } }
.fi-rise { animation: fi-rise .45s cubic-bezier(.22,1,.36,1) both }
.fi-drop { animation: fi-drop .55s cubic-bezier(.22,1,.36,1) .3s both }
.fi-draw { transform-origin: center; animation: fi-draw .4s cubic-bezier(.22,1,.36,1) .5s both }
.fi-fill { transform-origin: left; animation: fi-fill 1.7s cubic-bezier(.4,0,.2,1) both }
@media (prefers-reduced-motion: reduce) { .fi-rise, .fi-drop, .fi-draw, .fi-fill { animation: none } .fi-drop { transform: translate(-50%, 0) } }
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
      className="fixed inset-0 z-50 cursor-pointer flex flex-col items-center justify-center overflow-hidden select-none bg-white"
      role="img"
      aria-label="FindIt"
    >
      <style>{CSS}</style>
      <div className="relative flex flex-col items-center px-8 text-center">
        {/* The wordmark. The "i" is a dotless ı so the pin can sit where its dot would be. */}
        <div
          aria-hidden
          className="fi-rise text-[64px] leading-none font-bold tracking-[-0.03em] text-[#1E1B4B]"
          style={{ fontFamily: "Fraunces, serif", animationDelay: ".05s" }}
        >
          F
          <span className="relative inline-block">
            ı
            <svg
              className="fi-drop absolute left-1/2"
              style={{ top: -22 }}
              width="26"
              height="34"
              viewBox="0 0 26 34"
            >
              <path d="M13 1C6.4 1 1 6.2 1 12.7 1 21.3 13 33 13 33s12-11.7 12-20.3C25 6.2 19.6 1 13 1z" fill="#7C3AED" />
              <circle cx="13" cy="12.5" r="4.6" fill="#fff" />
            </svg>
          </span>
          nd<span className="text-[#7C3AED]">It</span>
        </div>

        <div aria-hidden className="fi-draw w-9 h-[3px] rounded-full bg-[#7C3AED] mt-[22px]" />

        <p
          aria-hidden
          className="fi-rise mt-[18px] text-[14.5px] leading-snug text-[#6B6483] max-w-[270px]"
          style={{ fontFamily: "'Work Sans', sans-serif", animationDelay: ".35s" }}
        >
          Tell us what you need. Verified sellers come to you.
        </p>
      </div>

      {/* A thin bar that fills over the time the splash is up, so it reads as "getting ready". */}
      <div
        aria-hidden
        className="absolute left-1/2 -translate-x-1/2 w-[120px] h-[3px] rounded-full overflow-hidden bg-[#F0ECFA]"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 56px)" }}
      >
        <div className="fi-fill h-full rounded-full bg-[#1E1B4B]" />
      </div>
    </motion.div>
  );
}
