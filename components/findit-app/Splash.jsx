"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import Image from "next/image";
import { DURATION, EASE } from "./motion";

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
      className="fixed inset-0 z-50 cursor-pointer"
      style={{ background: "#FAFAFF" }}
    >
      {/* contain, not cover — Welcome.jsx hit the same image has a fixed
          852:1846 aspect ratio, so cover crops it on a viewport with a
          different one. No interactive hit targets here to misalign, but
          cropping the wordmark or corner art is still a real regression on
          an odd-shaped screen, so this stays consistent with that fix. */}
      <Image src="/splash-brand.png" alt="FindIt" fill priority sizes="100vw" className="object-contain" />
    </motion.div>
  );
}
