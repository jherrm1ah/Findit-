"use client";

import { Mail, ShoppingBag, Search, Store } from "lucide-react";

const FAQS = [
  {
    icon: Search,
    q: "How do requests work?",
    a: "Describe what you're looking for — FindIt sends it to real sellers nearby, and they send you offers with their price. You pick the one you want.",
  },
  {
    icon: ShoppingBag,
    q: "How does payment work?",
    a: "When you order, FindIt holds your payment until YOU confirm the item arrived — the seller isn't paid before that. If something goes wrong, tap \u201cReport a problem\u201d on the order in My orders and we'll hold the money while we look into it.",
  },
  {
    icon: Store,
    q: "How do I become a seller?",
    a: "If you already have a FindIt account, open Profile and tap \u201cStart selling on FindIt\u201d \u2014 same account, same phone number. Add your business name and an admin reviews it, usually the same day, before you can list products or answer requests.",
  },
];

export default function HelpSupport() {
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
