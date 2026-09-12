"use client";

import { useState } from "react";
import { Mail, ShoppingBag, Search, Store, MessageCircle, ChevronRight, Plus } from "lucide-react";

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

      <div className="space-y-3 mb-7">
        {FAQS.map((f) => (
          <div key={f.q} className="bg-white border border-[#ECE9F7] rounded-[20px] p-4">
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-8 h-8 rounded-full bg-[#F5F2FC] flex items-center justify-center shrink-0">
                <f.icon size={14} className="text-[#7C3AED]" />
              </div>
              <p className="text-[13px] font-semibold text-[#1E1B4B]">{f.q}</p>
            </div>
            <p className="text-[12px] text-[#6B6483] leading-relaxed">{f.a}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide">My tickets</p>
        <button onClick={() => setOpening((v) => !v)} className="flex items-center gap-1 text-[11px] font-semibold text-[#7C3AED]">
          <Plus size={13} /> New ticket
        </button>
      </div>

      {opening && (
        <form onSubmit={submit} className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 mb-3 space-y-2.5">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={'Subject — e.g. "Order hasn\'t arrived"'}
            className="w-full border border-[#ECE9F7] rounded-lg px-3 py-2 text-[13px] outline-none"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Describe what's going on…"
            rows={3}
            className="w-full border border-[#ECE9F7] rounded-lg px-3 py-2 text-[13px] outline-none resize-none"
          />
          <button
            type="submit"
            disabled={!subject.trim() || !body.trim() || creating}
            className="text-white text-[12.5px] font-semibold px-4 py-2 rounded-xl disabled:opacity-40"
            style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
          >
            {creating ? "Sending…" : "Send"}
          </button>
        </form>
      )}

      <div className="space-y-2.5 mb-7">
        {tickets.length === 0 && !opening && (
          <p className="text-[12px] text-[#6B6483]">No support tickets yet — tap "New ticket" if you need help with something specific.</p>
        )}
        {tickets.map((t) => (
          <button
            key={t.id}
            onClick={() => onOpenTicket(t.id)}
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
          </button>
        ))}
      </div>

      <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3">Still need help?</p>
      <a
        href="mailto:virttechnologies.official@outlook.com"
        className="flex items-center gap-3 rounded-[20px] p-4 bg-white border border-[#ECE9F7]"
      >
        <div className="w-10 h-10 rounded-full bg-[#F5F2FC] flex items-center justify-center shrink-0">
          <Mail size={16} className="text-[#7C3AED]" />
        </div>
        <div className="flex-1">
          <p className="text-[13px] font-semibold text-[#1E1B4B]">Email support</p>
          <p className="text-[11.5px] text-[#6B6483]">virttechnologies.official@outlook.com</p>
        </div>
      </a>
    </div>
  );
}
