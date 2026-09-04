"use client";

import { CheckCircle2, Send, LayoutDashboard } from "lucide-react";
import { naira } from "./data";
import { Pill } from "./shared";

function budgetLabel(r) {
  if (!r.budgetMin && !r.budgetMax) return "Open";
  if (r.budgetMin && r.budgetMax && r.budgetMin !== r.budgetMax) {
    return `${naira(r.budgetMin)}–${naira(r.budgetMax).replace("₦", "")}`;
  }
  return naira(r.budgetMax || r.budgetMin);
}

export default function SellerDashboard({ requests, onSendOffer, user }) {
  const isSeller = user?.role === "seller";
  return (
    <div className="px-5 pt-6 pb-10">
      <div className="flex items-center gap-2 mb-1">
        <LayoutDashboard size={17} className="text-[#7C3AED]" />
        <h1 className="text-[19px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>Seller dashboard</h1>
      </div>
      <p className="text-[12px] text-[#6B6483] mb-5">
        {isSeller ? `${user.businessName} · Jos` : "Demo view · PowerPoint Electricals · Jos"}
      </p>
      {!isSeller && (
        <p className="text-[11px] text-[#6B6483] bg-[#F5F2FC] rounded-xl px-3 py-2 mb-5">
          Sign up with a seller account from your Profile to run this as your own shop.
        </p>
      )}

      <div className="grid grid-cols-4 gap-2 mb-6">
        {[["Rating", "4.9"], ["Orders", "212"], ["Response", "98%"], ["Payout", "₦186k"]].map(([l, v]) => (
          <div key={l} className="bg-white border border-[#ECE9F7] rounded-[20px] py-3 text-center shadow-sm shadow-[#4C1D95]/5">
            <p className="text-[14px] font-bold text-[#1E1B4B]">{v}</p>
            <p className="text-[9.5px] text-[#8A8372] uppercase tracking-wide">{l}</p>
          </div>
        ))}
      </div>

      <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3">Matching customer requests</p>
      <div className="space-y-3">
        {requests.length === 0 && (
          <p className="text-[12px] text-[#6B6483]">No open requests right now.</p>
        )}
        {requests.map((r) => (
          <div key={r.id} className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 shadow-sm shadow-[#4C1D95]/5">
            <div className="flex items-start justify-between mb-1">
              <p className="text-[13px] font-semibold text-[#1E1B4B] pr-2">{r.title}</p>
              <span className="text-[10px] text-[#8A8372] whitespace-nowrap">{r.posted}</span>
            </div>
            <p className="text-[11px] text-[#6B6483] mb-3">
              {r.customer || "Customer"} · Budget {budgetLabel(r)}
            </p>
            {r.offerCount > 0 ? (
              <Pill tone="green"><CheckCircle2 size={11} /> Offer sent</Pill>
            ) : (
              <button onClick={() => onSendOffer(r.id)} className="flex items-center gap-1.5 text-white text-[12px] font-semibold px-3.5 py-2 rounded-xl" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}>
                <Send size={12} /> Send offer
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
