"use client";

import { useState } from "react";
import { ChevronLeft, Star, BadgeCheck, ShieldCheck, MessageCircle, Package, MapPin, Crown, Calendar, Store } from "lucide-react";
import { GROUPS, naira } from "./data";
import { IconButton, ArtBlock, Pill } from "./shared";
import { haversineKm, formatDistanceKm } from "@/lib/geo";
import { VERIFICATION_LEVEL_COPY } from "@/lib/sellerVerificationLevels";

const LEVEL_TONE = { new: "stone", verified: "brand", trusted: "green" };
const LEVEL_ICON = { new: BadgeCheck, verified: ShieldCheck, trusted: ShieldCheck };

// Tap-to-explain, per spec: never just a bare label. Never claims a level
// FindIt hasn't actually reviewed — see computeVerificationLevel in
// lib/sellerVerificationLevels.ts, which this badge reflects exactly.
function VerificationBadge({ level }) {
  const [open, setOpen] = useState(false);
  const copy = VERIFICATION_LEVEL_COPY[level] ?? VERIFICATION_LEVEL_COPY.new;
  const Icon = LEVEL_ICON[level] ?? BadgeCheck;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}>
        <Pill tone={LEVEL_TONE[level] ?? "stone"}>
          <Icon size={10} /> {copy.label}
        </Pill>
      </button>
      {open && (
        <div className="absolute z-10 top-full left-0 mt-1.5 w-56 bg-white border border-[#ECE9F7] rounded-xl p-3 shadow-lg shadow-[#4C1D95]/10">
          <p className="text-[11px] text-[#514B67] leading-relaxed">{copy.explanation}</p>
        </div>
      )}
    </div>
  );
}

// Renders a seller's PUBLIC storefront from data the server assembled (see
// GET /api/sellers/[id] and lib/sellerPublicProfile.ts).
//
// This screen used to derive everything from the buyer's already-loaded
// products array, filtered on the seller's business NAME. That had three
// consequences: a seller with no active listings rendered a completely blank
// profile, because every field was read off listings[0]; two sellers sharing
// a business name were shown as one merged store; and nothing could be shown
// for a seller whose products the buyer hadn't happened to load. All three
// are why a buyer "couldn't view seller profiles".
export default function SellerProfile({ profile, loading, error, onBack, onOpenProduct, onContact, myLocation }) {
  const [contacting, setContacting] = useState(false);

  const listings = profile?.listings ?? [];
  const sellerName = profile?.name ?? null;
  const avgRating = profile?.rating ?? null;
  const verificationLevel = profile?.verificationLevel ?? "new";
  const proBadge = profile?.proBadge ?? false;
  const logoUrl = profile?.logoUrl ?? null;
  const bannerUrl = profile?.bannerUrl ?? null;
  const location = profile?.location ?? null;
  const memberSince = profile?.memberSince
    ? new Date(profile.memberSince).toLocaleDateString("en-NG", { month: "short", year: "numeric" })
    : null;
  // Distance is still derived from a listing, because that is where real
  // coordinates live; the seller's own coarse area is shown separately.
  const nearest = listings.find((p) => p.lat != null && p.lng != null);
  const km = myLocation && nearest
    ? haversineKm(myLocation.lat, myLocation.lng, nearest.lat, nearest.lng)
    : null;

  if (loading || error || !profile) {
    return (
      <div className="fixed inset-0 bg-[#FAFAFF] z-40 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-[#FAFAFF]/95 backdrop-blur px-5 pt-4 pb-3 flex items-center gap-3">
          <IconButton onClick={onBack} aria-label="Back"><ChevronLeft size={18} className="text-[#1E1B4B]" /></IconButton>
          <p className="text-[15px] font-bold text-[#1E1B4B] truncate">Seller</p>
        </div>
        <div className="px-5 py-16 text-center">
          <p className="text-[13px] text-[#6B6483]">
            {loading ? "Loading this store\u2026" : error || "This store isn\u2019t available."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#FAFAFF] z-40 overflow-y-auto pb-10">
      <div className="sticky top-0 z-10 bg-[#FAFAFF]/95 backdrop-blur px-5 pt-4 pb-3 flex items-center gap-3">
        <IconButton onClick={onBack} aria-label="Back"><ChevronLeft size={18} className="text-[#1E1B4B]" /></IconButton>
        <p className="text-[15px] font-bold text-[#1E1B4B] truncate">Seller</p>
      </div>

      {bannerUrl && (
        <div className="h-28 w-full mb-[-2.5rem] overflow-hidden">
          <img src={bannerUrl} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="px-5">
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center shrink-0 text-white text-[20px] font-bold overflow-hidden border-2 border-white shadow-md"
            style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
          >
            {logoUrl ? <img src={logoUrl} alt="" className="w-full h-full object-cover" /> : sellerName?.[0]?.toUpperCase() || "?"}
          </div>
          <div className="min-w-0">
            <p className="text-[17px] font-bold text-[#1E1B4B] truncate flex items-center gap-1.5" style={{ fontFamily: "Fraunces, serif" }}>
              {sellerName}
              {proBadge && (
                <span className="flex items-center gap-1 text-[9.5px] font-bold text-white px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}>
                  <Crown size={9} /> PRO
                </span>
              )}
            </p>
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              {avgRating && (
                <span className="flex items-center gap-0.5 text-[11px] text-[#6B6483]">
                  <Star size={11} className="fill-[#F59E0B] text-[#F59E0B]" /> {avgRating}
                </span>
              )}
              <span className="text-[11px] text-[#8A8372]">· {listings.length} listing{listings.length === 1 ? "" : "s"}</span>
              {km != null && (
                <span className="flex items-center gap-0.5 text-[11px] text-[#7C3AED] font-medium"><MapPin size={10} /> {formatDistanceKm(km)}</span>
              )}
              <VerificationBadge level={verificationLevel} />
            </div>
            {(location || memberSince) && (
              <div className="flex items-center gap-2 flex-wrap mt-1.5">
                {location && (
                  <span className="flex items-center gap-0.5 text-[10.5px] text-[#8A8372]"><MapPin size={9} /> {location}</span>
                )}
                {memberSince && (
                  <span className="flex items-center gap-0.5 text-[10.5px] text-[#8A8372]"><Calendar size={9} /> On FindIt since {memberSince}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* The dedicated storefront. Present only while the seller's paid
            plan actually publishes it — lib/sellerPublicProfile.ts returns
            null for storeSlug otherwise, so this never advertises a link
            that would land on a closed store. */}
        {profile.storeSlug && (
          <a
            href={`/store/${profile.storeSlug}`}
            className="w-full flex items-center justify-center gap-2 text-white text-[13px] font-semibold py-3 rounded-xl mb-4"
            style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
          >
            <Store size={15} /> Visit store
          </a>
        )}

        {profile.description && (
          <p className="text-[12.5px] text-[#514B67] leading-relaxed mb-4">{profile.description}</p>
        )}

        {(profile.completedOrderCount > 0 || profile.reviewCount > 0) && (
          <div className="flex items-center gap-4 mb-5 text-[11px] text-[#6B6483]">
            {profile.completedOrderCount > 0 && (
              <span>
                <b className="text-[#1E1B4B]">{profile.completedOrderCount}</b> completed order
                {profile.completedOrderCount === 1 ? "" : "s"}
              </span>
            )}
            {profile.reviewCount > 0 && (
              <span>
                <b className="text-[#1E1B4B]">{profile.reviewCount}</b> review
                {profile.reviewCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
        )}

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
