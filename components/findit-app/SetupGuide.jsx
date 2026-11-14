"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, Circle, Clock, X, ChevronDown } from "lucide-react";
import { DURATION, EASE, press } from "./motion";

export { setupSteps } from "@/lib/sellerSetup";

// "Set up your store": the few things that turn a new seller account into one
// that sells, in order, each ticking itself off from the seller's real data
// (nothing to tick by hand). The first step not yet done is open, with the
// one button that does it; the rest fold away. Gone once everything's done,
// and the seller can hide it on this device.

const hiddenKey = (id) => `findit_setup_guide_hidden_${id || "me"}`;
function readHidden(id) {
  try {
    return localStorage.getItem(hiddenKey(id)) === "1";
  } catch {
    return false;
  }
}

export default function SetupGuide({ steps, sellerKey, onAction }) {
  const [hidden, setHidden] = useState(() => readHidden(sellerKey));
  const firstOpen = steps.find((s) => !s.done)?.key ?? null;
  const [openKey, setOpenKey] = useState(firstOpen);
  const doneCount = steps.filter((s) => s.done).length;

  if (hidden || doneCount === steps.length) return null;

  const hide = () => {
    try {
      localStorage.setItem(hiddenKey(sellerKey), "1");
    } catch {
      // private mode: hidden for this visit only
    }
    setHidden(true);
  };

  return (
    <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 mb-4 shadow-sm shadow-[#4C1D95]/5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <p className="text-[14px] font-bold text-[#1E1B4B]" style={{ fontFamily: "var(--font-fraunces), Fraunces, serif" }}>
            Set up your store
          </p>
          <p className="text-[11.5px] text-[#6B6483]">
            {doneCount} of {steps.length} done
          </p>
        </div>
        <button onClick={hide} aria-label="Hide setup guide" className="p-1 -m-1 text-[#8A8372]">
          <X size={16} />
        </button>
      </div>

      <div className="h-1.5 rounded-full bg-[#F0ECFA] overflow-hidden mt-2 mb-3">
        <motion.div
          className="h-full rounded-full"
          style={{ background: "linear-gradient(90deg,#A855F7,#7C3AED)" }}
          initial={false}
          animate={{ width: `${(doneCount / steps.length) * 100}%` }}
          transition={{ duration: DURATION.base, ease: EASE }}
        />
      </div>

      <div className="divide-y divide-[#F0ECFA]">
        {steps.map((step) => {
          const open = openKey === step.key && !step.done;
          return (
            <div key={step.key}>
              <button
                onClick={() => setOpenKey(open ? null : step.key)}
                disabled={step.done}
                className="w-full flex items-center gap-2.5 py-2.5 text-left"
              >
                {step.done ? (
                  <CheckCircle2 size={18} className="text-[#7C3AED] shrink-0" />
                ) : step.waiting ? (
                  <Clock size={18} className="text-[#B45309] shrink-0" />
                ) : (
                  <Circle size={18} className="text-[#C9C2E3] shrink-0" strokeDasharray="3 3" />
                )}
                <span
                  className={`flex-1 text-[13px] ${
                    step.done ? "text-[#8A8372] line-through" : open ? "font-semibold text-[#1E1B4B]" : "text-[#1E1B4B]"
                  }`}
                >
                  {step.title}
                </span>
                {!step.done && (
                  <ChevronDown size={15} className={`text-[#8A8372] shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
                )}
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: DURATION.fast, ease: EASE }}
                    className="overflow-hidden"
                  >
                    <div className="pl-[28px] pb-3">
                      <p className="text-[12px] text-[#514B67] mb-2.5">{step.detail}</p>
                      {step.action && (
                        <motion.button
                          onClick={() => onAction(step.action)}
                          {...press}
                          className="text-white text-[12px] font-semibold px-4 py-2 rounded-xl"
                          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
                        >
                          {step.action.label}
                        </motion.button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
