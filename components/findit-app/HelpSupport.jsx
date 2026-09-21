"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mail, ShoppingBag, Search, Store, MessageCircle, ChevronRight, Plus } from "lucide-react";
import { DURATION, EASE, SPRING_BOUNCY, press, wiggleIn } from "./motion";

// A browsing/support screen (Group A) — local bouncy stagger for the FAQ
// and tickets lists, same spirit as Home's BOUNCE_CONTAINER/ITEM.
const BOUNCE_CONTAINER = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };
const BOUNCE_ITEM = {
  hidden: { opacity: 0, y: 20, scale: 0.88, rotate: -2 },
  visible: { opacity: 1, y: 0, scale: 1, rotate: 0, transition: SPRING_BOUNCY },
};

const FAQS = [
  {
    icon: Search,
    q: "How do requests work?",
    a: "Describe what you're looking for — FindIt sends it to real sellers nearby, and they send you offers with their price. You pick the one you want.",
  },
  {
    icon: ShoppingBag,
    q: "How does payment work?",
    a: "When you order, FindIt holds your payment until YOU confirm the item arrived — the seller isn't paid before that. If something goes wrong, tap “Report a problem” on the order in My orders and we'll hold the money while we look into it.",
  },
  {
    icon: Store,
    q: "How do I become a seller?",
    a: "If you already have a FindIt account, open Profile and tap “Start selling on FindIt” — same account, same phone number. Add your business name and an admin reviews it, usually the same day, before you can list products or answer requests.",
  },
];

function timeAgoShort(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

// Real in-app support tickets alongside the FAQ — an admin with the
// support permission domain sees and answers these (see AdminQueue.jsx's
// "Support" tab), not just a mailto link nobody but a human reads.
export default function HelpSupport({ tickets = [], onOpenTicket, onCreateTicket }) {
  const [opening, setOpening] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [creating, setCreating] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !body.trim() || creating) return;
    setCreating(true);
    try {
      await onCreateTicket(subject, body);
      setSubject("");
      setBody("");
      setOpening(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="px-5 pt-6 pb-10">
      <h1 className="text-[19px] font-bold text-[#1E1B4B] mb-1" style={{ fontFamily: "Fraunces, serif" }}>
        Help & support
      </h1>
      <p className="text-[12px] text-[#6B6483] mb-6">Common questions, and how to reach us.</p>

      <motion.div className="space-y-3 mb-7" initial="hidden" animate="visible" variants={BOUNCE_CONTAINER}>
        {FAQS.map((f, i) => (
          <motion.div key={f.q} variants={BOUNCE_ITEM} className="bg-white border border-[#ECE9F7] rounded-[20px] p-4">
            <div className="flex items-center gap-2.5 mb-1.5">
              <motion.div
                initial={wiggleIn.initial}
                animate={wiggleIn.animate}
                transition={{ ...SPRING_BOUNCY, delay: i * 0.06 }}
                className="w-8 h-8 rounded-full bg-[#F5F2FC] flex items-center justify-center shrink-0"
              >
                <f.icon size={14} className="text-[#7C3AED]" />
              </motion.div>
              <p className="text-[13px] font-semibold text-[#1E1B4B]">{f.q}</p>
            </div>
            <p className="text-[12px] text-[#6B6483] leading-relaxed">{f.a}</p>
          </motion.div>
        ))}
      </motion.div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide">My tickets</p>
        <motion.button onClick={() => setOpening((v) => !v)} whileTap={{ scale: 0.94, rotate: -3 }} transition={SPRING_BOUNCY} className="flex items-center gap-1 text-[11px] font-semibold text-[#7C3AED]">
          <Plus size={13} /> New ticket
        </motion.button>
      </div>

      <AnimatePresence initial={false}>
        {opening && (
          <motion.form
            onSubmit={submit}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: DURATION.fast, ease: EASE }}
            className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 mb-3 space-y-2.5 overflow-hidden"
          >
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={'Subject — e.g. "Order hasn\'t arrived"'}
              maxLength={200}
              className="w-full border border-[#ECE9F7] rounded-lg px-3 py-2 text-[13px] outline-none"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe what's going on…"
              rows={3}
              maxLength={2000}
              className="w-full border border-[#ECE9F7] rounded-lg px-3 py-2 text-[13px] outline-none resize-none"
            />
            <motion.button
              type="submit"
              disabled={!subject.trim() || !body.trim() || creating}
              {...press}
              className="text-white text-[12.5px] font-semibold px-4 py-2 rounded-xl disabled:opacity-40"
              style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
            >
              {creating ? "Sending…" : "Send"}
            </motion.button>
          </motion.form>
        )}
      </AnimatePresence>

      <motion.div className="space-y-2.5 mb-7" initial="hidden" animate="visible" variants={BOUNCE_CONTAINER}>
        {tickets.length === 0 && !opening && (
          <p className="text-[12px] text-[#6B6483]">No support tickets yet — tap "New ticket" if you need help with something specific.</p>
        )}
        {tickets.map((t, i) => (
          <motion.button
            key={t.id}
            variants={BOUNCE_ITEM}
            onClick={() => onOpenTicket(t.id)}
            whileTap={{ scale: 0.96, rotate: i % 2 === 0 ? -1.5 : 1.5 }}
            transition={SPRING_BOUNCY}
            className={`w-full flex items-center gap-3 rounded-[20px] p-3.5 text-left border ${t.userHasUnread ? "bg-[#F5F2FC] border-[#E4D9FA]" : "bg-white border-[#ECE9F7]"}`}
          >
            <div className="w-9 h-9 rounded-full bg-[#F5F2FC] flex items-center justify-center shrink-0">
              <MessageCircle size={15} className="text-[#7C3AED]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-[#1E1B4B] truncate">{t.subject}</p>
              <p className="text-[11px] text-[#6B6483]">{t.status === "resolved" ? "Resolved" : "Open"}</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-[10px] text-[#8A8372]">{timeAgoShort(t.updatedAt)}</span>
              {t.userHasUnread ? (
                <span className="w-4 h-4 rounded-full bg-[#F59E0B] text-white text-[9px] font-bold flex items-center justify-center">•</span>
              ) : (
                <ChevronRight size={14} className="text-[#B7AFD6]" />
              )}
            </div>
          </motion.button>
        ))}
      </motion.div>

      <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3">Still need help?</p>
      <motion.a
        href="mailto:virttechnologies.official@outlook.com"
        whileTap={{ scale: 0.97, rotate: -1.5 }}
        transition={SPRING_BOUNCY}
        className="flex items-center gap-3 rounded-[20px] p-4 bg-white border border-[#ECE9F7]"
      >
        <div className="w-10 h-10 rounded-full bg-[#F5F2FC] flex items-center justify-center shrink-0">
          <Mail size={16} className="text-[#7C3AED]" />
        </div>
        <div className="flex-1">
          <p className="text-[13px] font-semibold text-[#1E1B4B]">Email support</p>
          <p className="text-[11.5px] text-[#6B6483]">virttechnologies.official@outlook.com</p>
        </div>
      </motion.a>
    </div>
  );
}
