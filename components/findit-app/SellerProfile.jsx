"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, Star, BadgeCheck, MessageCircle, Package } from "lucide-react";
import { GROUPS, naira } from "./data";
import { IconButton, ArtBlock, Pill } from "./shared";

export default function SellerProfile({ sellerName, products, onBack, onOpenProduct, onContact }) {
  const [contacting, setContacting] = useState(false);
  const listings = useMemo(
    () => products.filter((p) => p.seller === sellerName),
    [products, sellerName]
  );

  // Every listing from the same seller already carries the same computed
  // rating/verified values (see getSellerStatsMap in lib/repo.ts) — no need
  // to re-aggregate them here.
  const avgRating = listings[0]?.rating ?? null;
  const verified = listings[0]?.verified ?? false;

  return (
    <div className="fixed inset-0 bg-[#FAFAFF] z-40 overflow-y-auto pb-10">
      <div className="sticky top-0 z-10 bg-[#FAFAFF]/95 backdrop-blur px-5 pt-4 pb-3 flex items-center gap-3">
        <IconButton onClick={onBack}><ChevronLeft size={18} className="text-[#1E1B4B]" /></IconButton>
        <p className="text-[15px] font-bold text-[#1E1B4B] truncate">Seller</p>
      </div>

      <div className="px-5">
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center shrink-0 text-white text-[20px] font-bold"
            style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
          >
            {sellerName?.[0]?.toUpperCase() || "?"}
          </div>
          <div className="min-w-0">
            <p className="text-[17px] font-bold text-[#1E1B4B] truncate" style={{ fontFamily: "Fraunces, serif" }}>
              {sellerName}
            </p>
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              {avgRating && (
                <span className="flex items-center gap-0.5 text-[11px] text-[#6B6483]">
                  <Star size={11} className="fill-[#F59E0B] text-[#F59E0B]" /> {avgRating}
                </span>
              )}
              <span className="text-[11px] text-[#8A8372]">· {listings.length} listing{listings.length === 1 ? "" : "s"}</span>
              {verified ? (
                <Pill tone="green"><BadgeCheck size={10} /> Verified</Pill>
              ) : (
                <Pill tone="stone">Unverified</Pill>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={async () => {
            setContacting(true);
            try {
              await onContact({ seller: sellerName });
            } finally {
              setContacting(false);
            }
          }}
          disabled={contacting}
          className={`w-full flex items-center justify-center gap-2 text-white text-[13px] font-semibold py-3 rounded-xl mb-6 ${contacting ? "opacity-60" : ""}`}
          style={{ background: "#1E1B4B" }}
        >
          <MessageCircle size={15} /> {contacting ? "Opening…" : "Contact seller"}
        </button>

        <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <Package size={13} className="text-[#7C3AED]" /> Listings
        </p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-5">
          {listings.map((p) => (
            <button key={p.id} onClick={() => onOpenProduct(p)} className="text-left">
              <div className="relative rounded-[20px] overflow-hidden mb-2">
                <ArtBlock icon={GROUPS[p.category].icon} art={p.art} imageUrl={p.imageUrl} className="h-32 w-full" />
              </div>
              <p className="text-[12px] font-medium text-[#1E1B4B] leading-tight line-clamp-2 h-8 mb-0.5">{p.name}</p>
              <p className="text-[13px] font-bold text-[#1E1B4B]">{naira(p.price)}</p>
            </button>
          ))}
          {listings.length === 0 && (
            <p className="col-span-2 text-center text-[13px] text-[#6B6483] py-10">No active listings right now.</p>
          )}
        </div>
      </div>
    </div>
  );
}
