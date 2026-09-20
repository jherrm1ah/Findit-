"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import { DURATION, EASE, SPRING_SOFT } from "./motion";

export default function Splash({ onDone }) {
  useEffect(() => {
    const doneTimer = setTimeout(onDone, 1800);
    return () => clearTimeout(doneTimer);
  }, [onDone]);

  return (
    <motion.div
      onClick={onDone}
      exit={{ opacity: 0 }}
      transition={{ duration: DURATION.base, ease: EASE }}
      className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer"
      style={{ background: "#6D28D9" }}
    >
      <motion.span
        initial={{ opacity: 0, y: 10, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={SPRING_SOFT}
        className="text-[32px] font-bold"
        style={{ fontFamily: "Fraunces, serif" }}
      >
        <span className="text-white">Find</span>
        <span style={{ color: "#FCD34D" }}>It</span>
      </motion.span>
    </motion.div>
  );
}
