"use client";

import { motion } from "motion/react";
import { Logo, Wordmark } from "./shared";
import { SPRING_BOUNCY, wiggleIn } from "./motion";

// About is a browsing/marketing screen (see this session's Group A) — a
// local bouncy stagger, same spirit as Home's BOUNCE_CONTAINER/ITEM, rather
// than the base system's restrained STAGGER_CONTAINER/ITEM.
const BOUNCE_CONTAINER = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };
const BOUNCE_ITEM = {
  hidden: { opacity: 0, y: 22, scale: 0.85, rotate: -3 },
  visible: { opacity: 1, y: 0, scale: 1, rotate: 0, transition: SPRING_BOUNCY },
};

export default function About() {
  return (
    <motion.div className="px-5 pt-6 pb-10" initial="hidden" animate="visible" variants={BOUNCE_CONTAINER}>
      <motion.div variants={BOUNCE_ITEM} className="flex flex-col items-center text-center mb-8 mt-4">
        <motion.div initial={wiggleIn.initial} animate={wiggleIn.animate} transition={SPRING_BOUNCY}>
          <Logo size={56} />
        </motion.div>
        <div className="mt-3">
          <Wordmark size="text-[22px]" />
        </div>
      </motion.div>

      <motion.div variants={BOUNCE_ITEM} className="bg-white border border-[#ECE9F7] rounded-[20px] p-5 mb-4">
        <p className="text-[13px] text-[#1E1B4B] leading-relaxed">
          FindIt is a request-first marketplace: tell us what you need, and real sellers near you send offers —
          instead of you scrolling through listings hoping someone has it.
        </p>
      </motion.div>

      <motion.div variants={BOUNCE_ITEM} className="bg-white border border-[#ECE9F7] rounded-[20px] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#ECE9F7]">
          <p className="text-[13px] text-[#1E1B4B]">Version</p>
          <p className="text-[13px] text-[#6B6483]">0.1.0</p>
        </div>
        <div className="flex items-center justify-between px-4 py-3.5">
          <p className="text-[13px] text-[#1E1B4B]">Made for</p>
          <p className="text-[13px] text-[#6B6483]">Nigeria</p>
        </div>
      </motion.div>

      <motion.div variants={BOUNCE_ITEM} className="bg-white border border-[#ECE9F7] rounded-[20px] overflow-hidden mt-4">
        <motion.a whileTap={{ scale: 0.96, rotate: -1.5 }} transition={SPRING_BOUNCY} href="/privacy" target="_blank" rel="noreferrer" className="flex items-center justify-between px-4 py-3.5 border-b border-[#ECE9F7]">
          <p className="text-[13px] text-[#1E1B4B]">Privacy Policy</p>
        </motion.a>
        <motion.a whileTap={{ scale: 0.96, rotate: 1.5 }} transition={SPRING_BOUNCY} href="/terms" target="_blank" rel="noreferrer" className="flex items-center justify-between px-4 py-3.5">
          <p className="text-[13px] text-[#1E1B4B]">Terms of Service</p>
        </motion.a>
      </motion.div>
    </motion.div>
  );
}
