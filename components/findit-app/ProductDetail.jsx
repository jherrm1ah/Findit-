"use client";

import { useState } from "react";
import {
  ChevronLeft, ShoppingBag, Heart, User, BadgeCheck, Star, CheckCircle2,
  Minus, Plus, Sparkles,
} from "lucide-react";
import { GROUPS, naira } from "./data";
import { IconButton, ArtBlock, Pill } from "./shared";

const CONDITIONS = ["New", "Used", "Refurb", "Any"];

export default function ProductDetail({ product, onClose, go, onBuyNow }) {
  const [saved, setSaved] = useState(false);
  const [condition, setCondition] = useState(0);
  const [qty, setQty] = useState(1);
  const [contacted, setContacted] = useState(false);
  if (!product) return null;
  const Icon = product.icon;
  const total = product.price * qty;

  return (
    <div className="fixed inset-0 bg-[#FAFAFF] z-40 overflow-y-auto pb-28">
      <div className="sticky top-0 z-10 bg-[#FAFAFF]/90 backdrop-blur px-5 pt-4 pb-3 flex items-center justify-between">
        <IconButton onClick={onClose}><ChevronLeft size={18} className="text-[#1E1B4B]" /></IconButton>
        <p className="text-[15px] font-bold text-[#1E1B4B]">Details</p>
        <IconButton onClick={() => go("request")}><ShoppingBag size={17} className="text-[#1E1B4B]" /></IconButton>
      </div>

      <div className="px-5">
        <div className="relative rounded-[20px] overflow-hidden mb-3">
          <ArtBlock icon={Icon} art={product.art} className="h-64 w-full" />
        </div>
        <div className="flex justify-center gap-1.5 mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#D9D2EF]" />
          <span className="w-5 h-1.5 rounded-full bg-[#7C3AED]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#D9D2EF]" />
        </div>

        <div className="flex items-start justify-between mb-1">
          <p className="text-[12px] text-[#8A8372]">{GROUPS[product.group].label}</p>
          <button onClick={() => setSaved((s) => !s)} className="w-8 h-8 rounded-full bg-white shadow-sm shadow-[#4C1D95]/10 flex items-center justify-center shrink-0 -mt-1">
            <Heart size={14} className={saved ? "fill-[#E64980] text-[#E64980]" : "text-[#8A8372]"} />
          </button>
        </div>
        <h1 className="text-[22px] font-bold text-[#1E1B4B] mb-3" style={{ fontFamily: "Fraunces, serif" }}>{product.name}</h1>

        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}>
              <User size={17} className="text-white" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-[#1E1B4B] flex items-center gap-1">
                {product.seller} {product.verified && <BadgeCheck size={13} className="text-[#7C3AED]" />}
              </p>
              <p className="text-[11px] text-[#8A8372] flex items-center gap-1">
                <Star size={10} className="fill-[#F59E0B] text-[#F59E0B]" /> {product.rating} · {product.loc}
              </p>
            </div>
          </div>
          <button
            onClick={() => setContacted(true)}
            disabled={contacted}
            className={`text-[12px] font-semibold px-4 py-2 rounded-full text-white flex items-center gap-1.5 shrink-0 ${contacted ? "bg-[#10B981]" : ""}`}
            style={!contacted ? { background: "#1E1B4B" } : {}}
          >
            {contacted ? <><CheckCircle2 size={13} /> Message sent</> : "Contact"}
          </button>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-[12px] text-[#8A8372] mb-2">Condition</p>
            <div className="flex gap-2">
              {CONDITIONS.map((c, i) => (
                <button
                  key={c}
                  onClick={() => setCondition(i)}
                  className={`w-10 h-10 rounded-xl text-[10.5px] font-semibold flex items-center justify-center ${condition === i ? "text-white" : "bg-[#F5F2FC] text-[#6B6483]"}`}
                  style={condition === i ? { background: "linear-gradient(135deg,#A855F7,#7C3AED)" } : {}}
                >
                  {c === "Refurb" ? "R" : c[0]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[12px] text-[#8A8372] mb-2 text-right">QTY</p>
            <div className="flex items-center gap-3 bg-[#F5F2FC] rounded-xl px-2 py-1.5">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-6 h-6 rounded-lg bg-white flex items-center justify-center shadow-sm">
                <Minus size={12} className="text-[#1E1B4B]" />
              </button>
              <span className="text-[13px] font-semibold text-[#1E1B4B] w-4 text-center">{qty}</span>
              <button onClick={() => setQty((q) => q + 1)} className="w-6 h-6 rounded-lg bg-white flex items-center justify-center shadow-sm">
                <Plus size={12} className="text-[#1E1B4B]" />
              </button>
            </div>
          </div>
        </div>

        <p className="text-[12px] font-semibold text-[#1E1B4B] mb-2">Description</p>
        <p className="text-[13px] leading-relaxed text-[#514B67] mb-4">
          Ships within Jos with pickup available. Payment is held by FindIt until you confirm delivery, so you never
          pay a seller directly. Condition and specifications are confirmed before dispatch.
        </p>

        <div className="flex gap-1.5 flex-wrap mb-2">
          {product.verified ? <Pill tone="green"><BadgeCheck size={11} /> Verified seller</Pill> : <Pill tone="stone">Unverified seller</Pill>}
          {product.testBatch && <Pill tone="brand"><Sparkles size={10} /> First-20 test batch</Pill>}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#ECE9F7] px-5 py-4 flex items-center justify-between z-50">
        <div>
          <p className="text-[11px] text-[#8A8372]">Total price</p>
          <p className="text-[19px] font-bold text-[#1E1B4B]">{naira(total)}</p>
        </div>
        <button onClick={() => onBuyNow(product, qty, CONDITIONS[condition])} className="flex items-center gap-2 text-white text-[13px] font-semibold pl-5 pr-6 py-3 rounded-full shadow-lg shadow-[#7C3AED]/25" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}>
          <ShoppingBag size={15} /> Buy now
        </button>
      </div>
    </div>
  );
}
