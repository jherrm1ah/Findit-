"use client";

import { useState } from "react";
import { ClipboardList, Clock, CheckCircle2, X, AlertTriangle } from "lucide-react";
import { ADMIN_SELLERS, ADMIN_REQUESTS } from "./data";
import { Pill } from "./shared";

export default function AdminQueue() {
  const [sellers, setSellers] = useState(ADMIN_SELLERS);
  const decide = (id, status) => setSellers(sellers.map((s) => (s.id === id ? { ...s, status } : s)));

  return (
    <div className="px-5 pt-6 pb-10">
      <div className="flex items-center gap-2 mb-5">
        <ClipboardList size={17} className="text-[#7C3AED]" />
        <h1 className="text-[19px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>Admin queue</h1>
      </div>

      <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3">Seller verification</p>
      <div className="space-y-3 mb-7">
        {sellers.map((s) => (
          <div key={s.id} className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 shadow-sm shadow-[#4C1D95]/5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[13px] font-semibold text-[#1E1B4B]">{s.name}</p>
              {s.status === "pending" && <Pill tone="gold"><Clock size={11} /> Pending</Pill>}
              {s.status === "approved" && <Pill tone="green"><CheckCircle2 size={11} /> Approved</Pill>}
              {s.status === "rejected" && <Pill tone="red"><X size={11} /> Rejected</Pill>}
            </div>
            <p className="text-[11px] text-[#6B6483] mb-3">{s.city} · Docs: {s.docs}</p>
            {s.status === "pending" && (
              <div className="flex gap-2">
                <button onClick={() => decide(s.id, "approved")} className="flex-1 text-white text-[12px] font-semibold py-2 rounded-xl" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}>Approve</button>
                <button onClick={() => decide(s.id, "rejected")} className="flex-1 bg-white border border-[#ECE9F7] text-[#E64980] text-[12px] font-semibold py-2 rounded-xl">Reject</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3">Unmatched requests</p>
      <div className="space-y-3">
        {ADMIN_REQUESTS.map((r) => (
          <div key={r.id} className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 flex items-start gap-3 shadow-sm shadow-[#4C1D95]/5">
            <AlertTriangle size={15} className="text-[#F59E0B] mt-0.5 shrink-0" />
            <div>
              <p className="text-[13px] font-semibold text-[#1E1B4B]">{r.item}</p>
              <p className="text-[11px] text-[#6B6483]">{r.age}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
