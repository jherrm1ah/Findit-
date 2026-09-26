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
    >
      <Image src="/splash-brand.png" alt="FindIt" fill priority sizes="100vw" className="object-cover" />
    </motion.div>
  );
}
