"use client";

import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";
import { DURATION, EASE } from "./motion";

const TONE_STYLES = {
  success: { bg: "#1E1B4B", icon: CheckCircle2, iconColor: "#34D399" },
  error: { bg: "#1E1B4B", icon: AlertTriangle, iconColor: "#F87171" },
};

export default function ToastHost({ toasts, onDismiss }) {
  return (
    <div className="fixed top-4 left-0 right-0 z-[60] flex flex-col items-center gap-2 px-5 pointer-events-none">
      {/* AnimatePresence needs this wrapper mounted even with zero toasts —
          it's what lets a dismissed toast play its exit instead of just
          vanishing. */}
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const tone = TONE_STYLES[t.tone] || TONE_STYLES.success;
          const Icon = tone.icon;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.96 }}
              transition={{ duration: DURATION.base, ease: EASE }}
              className="pointer-events-auto w-full max-w-[380px] flex items-center gap-2.5 text-white text-[12.5px] font-medium rounded-xl px-4 py-3 shadow-lg shadow-[#1E1B4B]/20"
              style={{ background: tone.bg }}
            >
              <Icon size={16} style={{ color: tone.iconColor }} className="shrink-0" />
              <span className="flex-1">{t.message}</span>
              <button onClick={() => onDismiss(t.id)} aria-label="Dismiss notification" className="shrink-0 text-white/60 hover:text-white">
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
