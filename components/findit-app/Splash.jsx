"use client";

import { useEffect, useState } from "react";

export default function Splash({ onDone }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showTimer = setTimeout(() => setVisible(true), 30);
    const doneTimer = setTimeout(onDone, 1800);
    return () => { clearTimeout(showTimer); clearTimeout(doneTimer); };
  }, [onDone]);

  return (
    <div
      onClick={onDone}
      className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer"
      style={{ background: "#6D28D9" }}
    >
      <span
        className="text-[32px] font-bold"
        style={{
          fontFamily: "Fraunces, serif",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.4s ease",
        }}
      >
        <span className="text-white">Find</span>
        <span style={{ color: "#FCD34D" }}>It</span>
      </span>
    </div>
  );
}
