"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X, SlidersHorizontal, CheckCircle2, Heart, BadgeCheck, Star, MapPin } from "lucide-react";
import { GROUPS, naira } from "./data";
import { ArtBlock } from "./shared";
import { haversineKm, formatDistanceKm } from "@/lib/geo";

export default function Browse({ initialGroup, openProduct, products, savedIds, onToggleSaved, myLocation }) {
  const [group, setGroup] = useState(initialGroup || "all");
  const [query, setQuery] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => { setGroup(initialGroup || "all"); }, [initialGroup]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = products.filter((p) => {
      if (group !== "all" && p.category !== group) return false;
      if (verifiedOnly && !p.verified) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
    if (!myLocation) return filtered;
    return filtered
      .map((p) => ({ ...p, _km: p.lat != null && p.lng != null ? haversineKm(myLocation.lat, myLocation.lng, p.lat, p.lng) : Infinity }))
      .sort((a, b) => a._km - b._km);
  }, [products, group, query, verifiedOnly, myLocation]);

  return (
    <div className="px-5 pt-6 pb-10">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-[20px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>Browse products</h1>
        <span className="text-[11px] text-[#8A8372]">{list.length} of {products.length}</span>
      </div>
      <p className="text-[12px] text-[#6B6483] mb-4">Every product from the FindIt idea bank — search, filter by category.</p>

      <div className="flex gap-2 mb-3">
        <div className="flex-1 flex items-center gap-2 bg-white border border-[#ECE9F7] rounded-[20px] px-3 py-2.5">
          <Search size={15} className="text-[#7C3AED]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products…"
            className="flex-1 text-[13px] outline-none text-[#1E1B4B] placeholder:text-[#8A8372]"
          />
          {query && <button onClick={() => setQuery("")}><X size={14} className="text-[#8A8372]" /></button>}
        </div>
        <button
          onClick={() => setShowFilters((s) => !s)}
          className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${showFilters ? "bg-[#7C3AED] border-[#7C3AED]" : "bg-white border-[#ECE9F7]"}`}
        >
          <SlidersHorizontal size={16} className={showFilters ? "text-white" : "text-[#7C3AED]"} />
        </button>
      </div>

      {showFilters && (
        <div className="flex flex-col gap-2 mb-3 text-[12px]">
          <button onClick={() => setVerifiedOnly((v) => !v)} className="flex items-center gap-1.5 text-[#514B67]">
            <div className={`w-4 h-4 rounded border flex items-center justify-center ${verifiedOnly ? "bg-[#7C3AED] border-[#7C3AED]" : "border-[#B7AFD6]"}`}>
              {verifiedOnly && <CheckCircle2 size={12} className="text-white" />}
            </div>
            Verified sellers only
          </button>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-5 px-5" style={{ scrollbarWidth: "none" }}>
        <button
          onClick={() => setGroup("all")}
          className={`shrink-0 text-[12px] font-medium px-3.5 py-2 rounded-full border transition ${group === "all" ? "text-white border-transparent" : "bg-white text-[#514B67] border-[#ECE9F7]"}`}
          style={group === "all" ? { background: "linear-gradient(135deg,#A855F7,#7C3AED)" } : {}}
        >
          All
        </button>
        {Object.entries(GROUPS).map(([k, g]) => (
          <button
            key={k}
            onClick={() => setGroup(k)}
            className={`shrink-0 text-[12px] font-medium px-3.5 py-2 rounded-full border transition flex items-center gap-1 ${group === k ? "text-white border-transparent" : "bg-white text-[#514B67] border-[#ECE9F7]"}`}
            style={group === k ? { background: "linear-gradient(135deg,#A855F7,#7C3AED)" } : {}}
          >
            <g.icon size={12} /> {g.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-5">
        {list.map((p) => (
          <button key={p.id} onClick={() => openProduct(p)} className="text-left">
            <div className="relative rounded-[20px] overflow-hidden mb-2">
              <ArtBlock icon={GROUPS[p.category].icon} art={p.art} imageUrl={p.imageUrl} className="h-32 w-full" />
              <span onClick={(e) => { e.stopPropagation(); onToggleSaved(p.id); }} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                <Heart size={14} className={savedIds.includes(p.id) ? "fill-[#E64980] text-[#E64980]" : "text-[#8A8372]"} />
              </span>
              {p.verified && (
                <span className="absolute bottom-2 left-2 bg-white/95 rounded-full p-1">
                  <BadgeCheck size={12} className="text-[#7C3AED]" />
                </span>
              )}
            </div>
            <p className="text-[12px] font-medium text-[#1E1B4B] leading-tight line-clamp-2 h-8 mb-0.5">{p.name}</p>
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-bold text-[#1E1B4B]">{naira(p.price)}</p>
              {p.rating != null && (
                <span className="flex items-center gap-0.5 text-[10px] text-[#8A8372]"><Star size={10} className="fill-[#F59E0B] text-[#F59E0B]" /> {p.rating}</span>
              )}
            </div>
            {Number.isFinite(p._km) && (
              <span className="flex items-center gap-0.5 text-[10px] text-[#8A8372] mt-0.5"><MapPin size={9} /> {formatDistanceKm(p._km)}</span>
            )}
          </button>
        ))}
        {list.length === 0 && (
          <p className="col-span-2 text-center text-[13px] text-[#6B6483] py-10">No matches — try requesting this item instead.</p>
        )}
      </div>
    </div>
  );
}
