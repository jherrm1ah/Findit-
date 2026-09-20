"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageCircle, Search, ShieldCheck, ArrowRight } from "lucide-react";
import { Logo, Wordmark } from "./shared";
import { DURATION, EASE, press } from "./motion";

const ONBOARDING_SLIDES = [
  {
    icon: MessageCircle,
    title: "Tell FindIt what\nyou need",
    subtitle: "Type it, snap a photo, or describe the problem — even if you don't know the product's name.",
  },
  {
    icon: Search,
    title: "We search trusted\nsellers near you",
    subtitle: "Verified shops, wholesalers and artisans compete to find your item and send real offers.",
  },
  {
    icon: ShieldCheck,
    title: "Pay safely,\nconfirm on delivery",
    subtitle: "Your payment is held by FindIt and only released to the seller once you've received your order.",
  },
];

export default function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);
  const slide = ONBOARDING_SLIDES[step];
  const isLast = step === ONBOARDING_SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-50 bg-[#FAFAFF] flex flex-col px-6 pt-6 pb-8">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Logo size={22} />
          <Wordmark size="text-[14px]" />
        </div>
        {!isLast && (
          <motion.button onClick={onDone} {...press} className="text-[12px] font-medium text-[#8A8372]">Skip</motion.button>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center px-2 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -32 }}
            transition={{ duration: DURATION.base, ease: EASE }}
            className="flex flex-col items-center"
          >
            <div
              className="w-24 h-24 rounded-[20px] flex items-center justify-center mb-8"
              style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
            >
              <slide.icon size={40} className="text-white" strokeWidth={1.6} />
            </div>
            <h1 className="text-[24px] font-bold text-[#1E1B4B] leading-[1.2] whitespace-pre-line mb-3" style={{ fontFamily: "Fraunces, serif" }}>
              {slide.title}
            </h1>
            <p className="text-[13.5px] text-[#6B6483] leading-relaxed max-w-[280px]">{slide.subtitle}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex justify-center gap-1.5 mb-6">
        {ONBOARDING_SLIDES.map((_, i) => (
          <motion.span
            key={i}
            animate={{ width: i === step ? 24 : 6 }}
            transition={{ duration: DURATION.fast, ease: EASE }}
            className={`h-1.5 rounded-full ${i === step ? "" : "bg-[#ECE9F7]"}`}
            style={i === step ? { background: "linear-gradient(90deg,#A855F7,#7C3AED)" } : {}}
          />
        ))}
      </div>

      <motion.button
        onClick={() => (isLast ? onDone() : setStep((s) => s + 1))}
        {...press}
        className="w-full text-white text-[14px] font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-[#7C3AED]/25"
        style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
      >
        {isLast ? "Get started" : "Next"} <ArrowRight size={16} />
      </motion.button>
    </div>
  );
}
