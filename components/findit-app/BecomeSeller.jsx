"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Store, ShieldCheck, ClipboardList, Package } from "lucide-react";
import { Field } from "./shared";
import { DURATION, EASE, SPRING_BOUNCY, press, wiggleIn } from "./motion";

// BecomeSeller is a browsing/marketing screen (Group A) — a local bouncy
// stagger for the "what happens next" list, same spirit as Home's
// BOUNCE_CONTAINER/ITEM. The submit button below stays a plain press — it
// changes a real account into a seller account.
const BOUNCE_CONTAINER = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };
const BOUNCE_ITEM = {
  hidden: { opacity: 0, y: 22, scale: 0.88, rotate: -2 },
  visible: { opacity: 1, y: 0, scale: 1, rotate: 0, transition: SPRING_BOUNCY },
};

// A buyer turning their existing account into a seller account. Before this
// existed, the only way to start selling was to sign up again — and since a
// phone number can only belong to one account, that meant needing a second
// phone number.
export default function BecomeSeller({ user, onBecomeSeller, go }) {
  const [businessName, setBusinessName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    const trimmed = businessName.trim();
    if (trimmed.length < 2 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onBecomeSeller(trimmed);
      go("dashboard");
    } catch (err) {
      setError(err.message || "Couldn't switch your account — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DURATION.base, ease: EASE }} className="px-5 pt-6 pb-10">
      <motion.div initial={wiggleIn.initial} animate={wiggleIn.animate} transition={SPRING_BOUNCY} className="flex items-center gap-2 mb-1">
        <Store size={18} className="text-[#7C3AED]" />
        <h1 className="text-[19px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>
          Start selling on FindIt
        </h1>
      </motion.div>
      <p className="text-[12px] text-[#6B6483] mb-5">
        Keep the same account and phone number — {user.name}, you&apos;ll just gain a seller dashboard.
      </p>

      <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 mb-5 shadow-sm shadow-[#4C1D95]/5">
        <Field label="Business name">
          <input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="e.g. Chidi Electronics"
            maxLength={80}
            className="w-full border border-[#ECE9F7] rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-[#7C3AED]"
          />
        </Field>
        <p className="text-[11px] text-[#6B6483] mt-2">
          This is the name buyers see on your listings and offers. You can change it later in Personal details.
        </p>
      </div>

      <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3">What happens next</p>
      <motion.div className="space-y-3 mb-6" initial="hidden" animate="visible" variants={BOUNCE_CONTAINER}>
        {[
          [ClipboardList, "A FindIt admin reviews your account", "Usually the same day. You keep buying as normal in the meantime."],
          [Package, "Then you can list products and answer requests", "Your dashboard shows orders to fulfil and requests that match what you sell."],
          [ShieldCheck, "Buyers' payments are held until they confirm delivery", "That protection runs both ways — it's why buyers trust ordering from someone new."],
        ].map(([Icon, title, body], i) => (
          <motion.div key={title} variants={BOUNCE_ITEM} className="flex gap-3 bg-white border border-[#ECE9F7] rounded-[20px] p-4">
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.25 }}
              className="w-9 h-9 rounded-full bg-[#F5F2FC] flex items-center justify-center shrink-0"
            >
              <Icon size={16} className="text-[#7C3AED]" />
            </motion.div>
            <div>
              <p className="text-[13px] font-semibold text-[#1E1B4B] mb-0.5">{title}</p>
              <p className="text-[11px] text-[#6B6483] leading-relaxed">{body}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.fast, ease: EASE }}
            className="text-[12px] text-[#E64980] mb-3"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <motion.button
        onClick={submit}
        disabled={businessName.trim().length < 2 || submitting}
        {...press}
        className={`w-full text-white text-[13px] font-semibold py-3 rounded-xl ${
          businessName.trim().length < 2 || submitting ? "opacity-40" : "shadow-lg shadow-[#7C3AED]/25"
        }`}
        style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
      >
        {submitting ? "Setting up…" : "Submit for review"}
      </motion.button>
    </motion.div>
  );
}
