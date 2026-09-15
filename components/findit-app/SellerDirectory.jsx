"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Search, X, Star, MapPin, BadgeCheck, ShieldCheck, Crown, ChevronLeft } from "lucide-react";
import { IconButton } from "./shared";
import { api } from "./api";
import { VERIFICATION_LEVEL_COPY } from "@/lib/sellerVerificationLevels";

const LEVEL_ICON = { new: BadgeCheck, verified: ShieldCheck, trusted: ShieldCheck };

// Renders the server's public directory (GET /api/sellers/directory,
// lib/sellerDirectory.ts) — every approved seller a buyer can browse without
// already knowing a name or a shared link, unlike SellerProfile.jsx (opened
// FROM a specific product or order) and /store/[slug] (opened from a shared
// URL). Filtering here is a client-side pass over one already-loaded list,
// the same pattern Browse.jsx uses for products.
export default function SellerDirectory({ onBack, onViewSeller, initialQuery }) {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState(initialQuery || "");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  // Lets Home's own search bar send a buyer straight to results instead of
  // an empty directory they then have to search within a second time — same
  // "initial* prop synced on every navigation" convention as Browse.jsx's
  // initialGroup.
  useEffect(() => {
    setQuery(initialQuery || "");
  }, [initialQuery]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getSellerDirectory()
      .then((data) => {
        if (!cancelled) setSellers(data ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Couldn't load sellers.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sellers.filter((s) => {
      if (verifiedOnly && s.verificationLevel === "new") return false;
      if (q && !s.name.toLowerCase().includes(q) && !(s.category ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sellers, query, verifiedOnly]);

  return (
    <div className="px-5 pt-6 pb-10">
      <div className="flex items-center gap-3 mb-1">
        {onBack && (
          <IconButton onClick={onBack} aria-label="Back">
            <ChevronLeft size={18} className="text-[#1E1B4B]" />
          </IconButton>
        )}
        <h1 className="text-[20px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>
          Sellers
        </h1>
      </div>
      <p className="text-[12px] text-[#6B6483] mb-4 ml-11">
        Every approved seller on FindIt — browse stores instead of products.
      </p>

      <div className="flex items-center gap-2 bg-white border border-[#ECE9F7] rounded-[20px] px-3 py-2.5 mb-3">
        <Search size={15} className="text-[#7C3AED]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sellers…"
          className="flex-1 text-[13px] outline-none text-[#1E1B4B] placeholder:text-[#8A8372]"
        />
        {query && (
          <button onClick={() => setQuery("")} aria-label="Clear search">
            <X size={14} className="text-[#8A8372]" />
          </button>
        )}
      </div>

      <button
        onClick={() => setVerifiedOnly((v) => !v)}
        className="flex items-center gap-1.5 text-[12px] text-[#514B67] mb-4"
      >
        <div
          className={`w-4 h-4 rounded border flex items-center justify-center ${verifiedOnly ? "bg-[#7C3AED] border-[#7C3AED]" : "border-[#B7AFD6]"}`}
        >
          {verifiedOnly && <ShieldCheck size={10} className="text-white" />}
        </div>
        Verified &amp; trusted sellers only
      </button>

      {loading && <p className="text-[13px] text-[#6B6483] py-10 text-center">Loading sellers…</p>}
      {!loading && error && <p className="text-[13px] text-[#6B6483] py-10 text-center">{error}</p>}

      {!loading && !error && (
        <div className="space-y-3">
          {list.map((s) => {
            const copy = VERIFICATION_LEVEL_COPY[s.verificationLevel] ?? VERIFICATION_LEVEL_COPY.new;
            const LevelIcon = LEVEL_ICON[s.verificationLevel] ?? BadgeCheck;
            return (
              <button
                key={s.id}
                onClick={() => onViewSeller(s.id)}
                className="w-full flex items-center gap-3 bg-white border border-[#ECE9F7] rounded-[20px] p-3.5 text-left shadow-sm shadow-[#4C1D95]/5"
              >
                <div
                  className="relative w-14 h-14 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-white text-[19px] font-bold"
                  style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
                >
                  {s.logoUrl ? (
                    <Image src={s.logoUrl} alt="" fill sizes="56px" className="object-cover" />
                  ) : (
                    s.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-[#1E1B4B] truncate flex items-center gap-1.5">
                    {s.name}
                    {s.proBadge && (
                      <span
                        className="flex items-center gap-0.5 text-[9px] font-bold text-white px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
                      >
                        <Crown size={8} /> PRO
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1 text-[11px] text-[#6B6483]">
                    <span className="flex items-center gap-0.5 text-[#7C3AED] font-medium">
                      <LevelIcon size={11} /> {copy.label}
                    </span>
                    {s.rating !== null && (
                      <span className="flex items-center gap-0.5">
                        <Star size={10} className="fill-[#F59E0B] text-[#F59E0B]" /> {s.rating}
                      </span>
                    )}
                    <span>
                      {s.activeListingCount} listing{s.activeListingCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  {(s.category || s.location) && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-1 text-[10.5px] text-[#8A8372]">
                      {s.category && <span>{s.category}</span>}
                      {s.location && (
                        <span className="flex items-center gap-0.5">
                          <MapPin size={9} /> {s.location}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
          {list.length === 0 && (
            <p className="text-center text-[13px] text-[#6B6483] py-10">No sellers match your search.</p>
          )}
        </div>
      )}
    </div>
  );
}
