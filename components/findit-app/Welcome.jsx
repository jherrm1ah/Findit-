"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { DURATION, EASE, SPRING_SNAPPY } from "./motion";
import { IconButton } from "./sharedMotion";

// The "Let's get you started" screen. The FindIt logo and the 3D illustration are images (cut
// from the original artwork, a few KB each); the heading, text and both buttons are real text and
// real buttons, so they're sharp on every screen, show a press, are read by screen readers and
// always sit exactly where they look, on any phone shape.
//
// onDismiss is optional: it's passed when this screen interrupts someone browsing as a guest
// (a gated action, see App.jsx's requireAuth), so they can back out without an account.
const INK = "#1E1265";
const PURPLE = "#5B21F5";

export default function Welcome({ onGetStarted, onHaveAccount, onDismiss }) {
  return (
    <motion.div
      exit={{ opacity: 0 }}
      transition={{ duration: DURATION.base, ease: EASE }}
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ background: "radial-gradient(120% 70% at 50% 35%, #FFFFFF 0%, #F9F8FE 55%, #F4F1FC 100%)" }}
    >
      {onDismiss && (
        <div className="absolute top-4 right-4 z-10">
          <IconButton onClick={onDismiss} aria-label="Continue browsing without an account">
            <X size={18} className="text-[#1E1B4B]" />
          </IconButton>
        </div>
      )}

      <div className="mx-auto flex min-h-full max-w-md flex-col px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(40px,env(safe-area-inset-top))] [@media(max-height:700px)]:pt-[max(20px,env(safe-area-inset-top))]">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="mt-6 flex justify-center [@media(max-height:700px)]:mt-1"
        >
          <Image src="/welcome-logo.webp" alt="FindIt" width={420} height={190} priority className="h-auto w-[52%] max-w-[230px] [@media(max-height:700px)]:max-w-[170px]" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.08 }}
          className="my-auto flex justify-center py-4"
        >
          {/* The artwork's edges fade to transparent in the file itself, so no box shows around
              it. It shrinks on short screens so both buttons always fit without scrolling. */}
          <Image
            src="/welcome-art.webp"
            alt=""
            aria-hidden
            width={730}
            height={520}
            priority
            draggable={false}
            className="h-auto max-h-[32vh] [@media(max-height:700px)]:max-h-[26vh] w-auto max-w-full select-none sm:max-w-[380px]"
          />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.15 }}>
          <h1
            className="text-[34px] [@media(max-height:700px)]:text-[29px] font-bold leading-[1.08] tracking-[-0.02em]"
            style={{ color: INK, fontFamily: "'Work Sans', sans-serif" }}
          >
            Let&apos;s get you
            <br />
            started
          </h1>
          <p className="mt-3 text-[15px] leading-[1.45] text-[#7A6FB0]">
            Create your account and start exploring amazing products, deals and more.
          </p>

          <div className="mt-7 space-y-3 [@media(max-height:700px)]:mt-5">
            <motion.button
              type="button"
              onClick={onGetStarted}
              whileTap={{ scale: 0.97 }}
              transition={SPRING_SNAPPY}
              className="w-full rounded-full py-4 text-[16px] font-semibold text-white shadow-lg shadow-[#5B21F5]/25 outline-none focus-visible:ring-4 focus-visible:ring-[#5B21F5]/30"
              style={{ background: `linear-gradient(135deg, #6D34FF 0%, ${PURPLE} 100%)` }}
            >
              Get Started
            </motion.button>
            <motion.button
              type="button"
              onClick={onHaveAccount}
              whileTap={{ scale: 0.97 }}
              transition={SPRING_SNAPPY}
              className="w-full rounded-full border-[1.5px] border-[#C9B8F7] bg-white/60 py-4 text-[16px] font-semibold outline-none focus-visible:ring-4 focus-visible:ring-[#5B21F5]/20"
              style={{ color: PURPLE }}
            >
              I already have an account
            </motion.button>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
