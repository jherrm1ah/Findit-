"use client";

import { useEffect, useState } from "react";

export default function Splash({ onDone }) {
  const [stage, setStage] = useState(0); // 0 hidden -> 1 icon -> 2 wordmark -> 3 tagline

  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 60);
    const t2 = setTimeout(() => setStage(2), 380);
    const t3 = setTimeout(() => setStage(3), 640);
    const doneTimer = setTimeout(onDone, 2600);
    return () => { [t1, t2, t3, doneTimer].forEach(clearTimeout); };
  }, [onDone]);

  return (
    <div
      onClick={onDone}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center cursor-pointer overflow-hidden"
      style={{ background: "linear-gradient(160deg,#4C1D95 0%,#7C3AED 55%,#A855F7 100%)" }}
    >
      <div className="absolute -top-24 -right-16 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute -bottom-28 -left-20 w-80 h-80 rounded-full bg-white/5 blur-3xl" />

      <div
        className="relative flex flex-col items-center"
        style={{
          opacity: stage >= 1 ? 1 : 0,
          transform: stage >= 1 ? "scale(1)" : "scale(0.85)",
          transition: "opacity 0.55s ease, transform 0.55s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        <div className="relative flex items-center justify-center mb-1">
          <div className="absolute w-28 h-28 rounded-full bg-white/15 blur-xl" />
          <svg width="108" height="108" viewBox="0 0 100 100" fill="none" className="relative">
            {/* motion lines */}
            <rect x="2" y="28" width="30" height="7" rx="3.5" fill="white" opacity="0.9" />
            <rect x="10" y="42" width="22" height="7" rx="3.5" fill="white" opacity="0.7" />
            <rect x="18" y="56" width="12" height="7" rx="3.5" fill="white" opacity="0.5" />

            {/* magnifying glass ring + handle */}
            <circle cx="60" cy="42" r="21" stroke="white" strokeWidth="9" fill="none" />
            <rect x="0" y="0" width="10" height="26" rx="5" fill="white" transform="translate(74 73) rotate(-45)" />

            {/* bag inside the glass */}
            <path d="M51 32 a9 11 0 0 1 18 0" stroke="#7C3AED" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path d="M44 36 H76 L71.5 60 a4 4 0 0 1 -4 3.4 H48.5 a4 4 0 0 1 -4 -3.4 Z" fill="white" />
          </svg>
        </div>

        <span
          className="text-[36px] font-bold text-white"
          style={{
            fontFamily: "Fraunces, serif",
            opacity: stage >= 2 ? 1 : 0,
            transform: stage >= 2 ? "translateY(0)" : "translateY(8px)",
            transition: "opacity 0.5s ease, transform 0.5s ease",
          }}
        >
          Find<span style={{ color: "#FCD34D" }}>It</span>
        </span>

        <p
          className="text-[12.5px] text-white/75 mt-2 tracking-wide"
          style={{
            opacity: stage >= 3 ? 1 : 0,
            transform: stage >= 3 ? "translateY(0)" : "translateY(6px)",
            transition: "opacity 0.5s ease, transform 0.5s ease",
          }}
        >
          Tell us what you need. We'll find it.
        </p>
      </div>
    </div>
  );
}
