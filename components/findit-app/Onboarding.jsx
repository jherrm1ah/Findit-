"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageCircle, Search, ShieldCheck, ChevronRight } from "lucide-react";
import { DURATION, EASE, press } from "./motion";

// FindIt's own palette, one shade per step — not a reference template's
// arbitrary rainbow of unrelated hues (this app has one brand color), but
// the same underlying structure: the whole screen IS the color, and it
// changes as the buyer moves through the steps. #1E1B4B is FindIt's own
// "ink" (used everywhere else for headings/text) rather than a 4th purple
// — needed for real contrast between steps, since three shades from the
// same narrow mid-purple range made the diagonal wipe below barely
// perceptible in testing.
const STEP_COLORS = ["#1E1B4B", "#7C3AED", "#A855F7"];

const ONBOARDING_SLIDES = [
  { icon: MessageCircle, title: "Tell FindIt what\nyou need" },
  { icon: Search, title: "We find trusted\nsellers near you" },
  { icon: ShieldCheck, title: "Pay safely,\nconfirm on delivery" },
];

export default function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);
  const slide = ONBOARDING_SLIDES[step];
  const isLast = step === ONBOARDING_SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Solid base matching the CURRENT step's color, full coverage,
          underneath the sweeping layers below. The sweep only has to look
          right in flight — this is what guarantees there's never a flash
          of anything else showing through a gap at the oversized skewed
          rectangle's edge, on any viewport size. */}
      <div className="absolute inset-0" style={{ background: STEP_COLORS[step] }} />
      {/* The diagonal wipe: each step's color is a wide, skewed rectangle
          that slides fully across on enter and fully off on exit.
          AnimatePresence's default (non-"wait") mode runs both at once, so
          the incoming color visibly pushes the outgoing one off — that
          crossing of the two skewed edges mid-flight IS the diagonal
          wipe, not a separate effect layered on top.
          Deliberately `ease: "linear"`, not the shared EASE token — EASE is
          tuned to front-load a card/overlay's motion so it *settles*
          quickly (the right feel for something entering to rest). Applied
          here, ~95% of this layer's travel happened in the first 20% of
          the duration, so the edge had already swept past and off-screen
          before a viewer could actually see it cross — confirmed by
          sampling the live transform mid-flight, not just eyeballing it.
          A wipe needs to be SEEN sweeping at a steady pace, which is
          exactly what linear easing (constant velocity) gives it. */}
      <AnimatePresence initial={false}>
        <motion.div
          key={step}
          className="absolute"
          style={{
            top: "-20%",
            bottom: "-20%",
            left: "-30%",
            width: "160%",
            background: STEP_COLORS[step],
            transform: "skewX(-8deg)",
          }}
          initial={{ x: "110%" }}
          animate={{ x: "0%" }}
          exit={{ x: "-110%" }}
          transition={{ duration: 0.55, ease: "linear" }}
        />
      </AnimatePresence>

      <div className="relative z-10 h-full flex flex-col px-6 pt-6 pb-10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[15px] font-bold text-white" style={{ fontFamily: "Fraunces, serif" }}>FindIt</span>
          {!isLast && (
            <motion.button onClick={onDone} {...press} className="text-[12px] font-medium text-white/80">Skip</motion.button>
          )}
        </div>

        <div className="flex-1 flex flex-col items-center justify-center text-center px-2 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: DURATION.base, ease: EASE }}
              className="flex flex-col items-center"
            >
              <div className="w-24 h-24 rounded-[24px] bg-white/15 flex items-center justify-center mb-8">
                <slide.icon size={40} className="text-white" strokeWidth={1.6} />
              </div>
              <h1 className="text-[26px] font-bold text-white leading-[1.2] whitespace-pre-line" style={{ fontFamily: "Fraunces, serif" }}>
                {slide.title}
              </h1>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex justify-center gap-1.5 mb-8">
          {ONBOARDING_SLIDES.map((_, i) => (
            <motion.span
              key={i}
              animate={{ width: i === step ? 20 : 6, opacity: i === step ? 1 : 0.45 }}
              transition={{ duration: DURATION.fast, ease: EASE }}
              className="h-1.5 rounded-full bg-white"
            />
          ))}
        </div>

        <div className="flex justify-center">
          <motion.button
            onClick={() => (isLast ? onDone() : setStep((s) => s + 1))}
            {...press}
            aria-label={isLast ? "Get started" : "Next"}
            className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg shadow-black/20"
          >
            <ChevronRight size={26} style={{ color: STEP_COLORS[step] }} strokeWidth={2.4} />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
