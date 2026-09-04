"use client";

import { useEffect, useState } from "react";

export default function Splash({ onDone }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showTimer = setTimeout(() => setVisible(true), 30);
    const doneTimer = setTimeout(onDone, 2200);
    return () => { clearTimeout(showTimer); clearTimeout(doneTimer); };
  }, [onDone]);

  return (
    <div
      onClick={onDone}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white cursor-pointer"
    >
      <div
        className="flex flex-col items-center"
        style={{ opacity: visible ? 1 : 0, transform: visible ? "scale(1)" : "scale(0.92)", transition: "opacity 0.6s ease, transform 0.6s ease" }}
      >
        <svg width="128" height="128" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="splashGrad" x1="10" y1="10" x2="95" y2="90" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#A855F7" />
              <stop offset="50%" stopColor="#7C3AED" />
              <stop offset="100%" stopColor="#4C1D95" />
            </linearGradient>
          </defs>

          {/* motion lines */}
          <rect x="2" y="28" width="30" height="7" rx="3.5" fill="url(#splashGrad)" />
          <rect x="10" y="42" width="22" height="7" rx="3.5" fill="url(#splashGrad)" opacity="0.85" />
          <rect x="18" y="56" width="12" height="7" rx="3.5" fill="url(#splashGrad)" opacity="0.65" />

          {/* magnifying glass ring + handle */}
          <circle cx="60" cy="42" r="21" stroke="url(#splashGrad)" strokeWidth="9" fill="none" />
          <rect x="0" y="0" width="10" height="26" rx="5" fill="url(#splashGrad)" transform="translate(74 73) rotate(-45)" />

          {/* bag inside the glass */}
          <path d="M51 32 a9 11 0 0 1 18 0" stroke="white" strokeWidth="3" strokeLinecap="round" fill="none" />
          <path d="M44 36 H76 L71.5 60 a4 4 0 0 1 -4 3.4 H48.5 a4 4 0 0 1 -4 -3.4 Z" fill="url(#splashGrad)" />
        </svg>

        <span className="text-[34px] font-bold mt-5" style={{ fontFamily: "Fraunces, serif" }}>
          <span style={{ color: "#1E1B4B" }}>Find</span>
          <span style={{ background: "linear-gradient(90deg,#A855F7,#7C3AED)", WebkitBackgroundClip: "text", color: "transparent" }}>It</span>
        </span>
      </div>
    </div>
  );
}
