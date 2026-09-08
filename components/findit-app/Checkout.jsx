"use client";

import { CheckCircle2, ShieldCheck } from "lucide-react";
import { STEPS, naira } from "./data";

export default function Checkout({ product, qty, condition, go }) {
  const total = product.price * qty;
  const activeIdx = 0; // just paid — awaiting seller prep
  return (
    <div className="px-5 pt-6 pb-10">
      <div className="flex items-center gap-2 mb-5">
        <CheckCircle2 className="text-[#7C3AED]" size={22} />
        <h1 className="text-[19px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>Payment held — order placed</h1>
      </div>
      <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 mb-5 shadow-sm shadow-[#4C1D95]/5">
        <p className="text-[12px] text-[#6B6483] mb-1">{product.name} · {condition} · Qty {qty}</p>
        <p className="text-[15px] font-semibold text-[#1E1B4B] mb-1">{product.seller}</p>
        <p className="text-[18px] font-bold text-[#7C3AED]">{naira(total)}</p>
      </div>
      <div className="bg-[#F5F2FC] rounded-[20px] p-4 mb-5 flex items-start gap-2.5">
        <ShieldCheck size={16} className="text-[#7C3AED] mt-0.5 shrink-0" />
        <p className="text-[12px] text-[#514B67]">Your payment is held by FindIt, not the seller. It only releases once you confirm delivery — see it anytime under My orders.</p>
      </div>
      <p className="text-[12px] font-medium text-[#514B67] mb-3 uppercase tracking-wide">Delivery status</p>
      <div className="space-y-0 mb-6">
        {STEPS.map((s, i) => (
          <div key={s} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full ${i <= activeIdx ? "bg-[#7C3AED]" : "bg-[#E4DFF5]"}`} />
              {i < STEPS.length - 1 && <div className={`w-0.5 flex-1 ${i < activeIdx ? "bg-[#7C3AED]" : "bg-[#E4DFF5]"}`} style={{ minHeight: 28 }} />}
            </div>
            <p className={`text-[13px] pb-6 ${i <= activeIdx ? "text-[#1E1B4B] font-medium" : "text-[#8A8372]"}`}>{s}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={() => go("account")} className="flex-1 text-white text-[13px] font-semibold py-3 rounded-xl" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}>
          Track in My orders
        </button>
        <button onClick={() => go("home")} className="px-5 text-[13px] font-semibold text-[#6B6483] border border-[#ECE9F7] rounded-xl">
          Home
        </button>
      </div>
    </div>
  );
}
