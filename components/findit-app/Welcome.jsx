"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { DURATION, EASE } from "./motion";

// The two buttons baked into welcome-get-started.png have no real DOM
// elements of their own — the artwork supplies 100% of the visual design,
// so what makes them actually tappable is a transparent hit target
// positioned (as a percentage of the image, not a fixed pixel) over where
// each one is drawn, sized generously enough to forgive being slightly off.
export default function Welcome({ onGetStarted, onHaveAccount }) {
  return (
    <motion.div
      exit={{ opacity: 0 }}
      transition={{ duration: DURATION.base, ease: EASE }}
      className="fixed inset-0 z-50"
    >
      <Image src="/welcome-get-started.png" alt="Let's get you started" fill priority sizes="100vw" className="object-cover" />
      <button
        onClick={onGetStarted}
        aria-label="Get Started"
        className="absolute"
        style={{ top: "79%", left: "10%", width: "80%", height: "6.5%" }}
      />
      <button
        onClick={onHaveAccount}
        aria-label="I already have an account"
        className="absolute"
        style={{ top: "86.5%", left: "10%", width: "80%", height: "6.5%" }}
      />
    </motion.div>
  );
}
