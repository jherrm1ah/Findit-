"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, Star, BadgeCheck, ShieldCheck, MessageCircle, Package, MapPin, Crown, Calendar, Store } from "lucide-react";
import { categoryGroup, naira } from "./data";
import { ArtBlock, Pill } from "./shared";
import { IconButton } from "./sharedMotion";
import { haversineKm, formatDistanceKm } from "@/lib/geo";
import { VERIFICATION_LEVEL_COPY } from "@/lib/sellerVerificationLevels";
import { DURATION, EASE, SPRING_BOUNCY, STAGGER_CONTAINER, STAGGER_ITEM, revealOnView, press, wiggleIn } from "./motion";

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
      <motion.button type="button" onClick={() => setOpen((o) => !o)} whileTap={{ scale: 0.94 }} transition={{ duration: DURATION.instant }}>
        <Pill tone={LEVEL_TONE[level] ?? "stone"}>
          <Icon size={10} /> {copy.label}
        </Pill>
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: DURATION.fast, ease: EASE }}
            className="absolute z-10 top-full left-0 mt-1.5 w-56 bg-white border border-[#ECE9F7] rounded-xl p-3 shadow-lg shadow-[#4C1D95]/10"
          >
            <p className="text-[11px] text-[#514B67] leading-relaxed">{copy.explanation}</p>
          </motion.div>
        )}
      </AnimatePresence>
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
export default function SellerProfile({ profile, loading, error, onBack, onOpenProduct, onContact, myLocation, viewerSellerId }) {
  const [contacting, setContacting] = useState(false);

  // A seller previewing their own storefront (or one who happened to land
  // here via a stale link) is looking at their own listing — the server
  // already refuses to create a self-conversation, but that only surfaces
  // as an error toast after tapping a button that should never have been
  // offered in the first place.
  const isOwnProfile = viewerSellerId != null && profile?.id === viewerSellerId;

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
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        transition={{ duration: DURATION.base, ease: EASE }}
        className="fixed inset-0 bg-[#FAFAFF] z-40 overflow-y-auto"
      >
        <div className="sticky top-0 z-10 bg-[#FAFAFF]/95 backdrop-blur px-5 pt-4 pb-3 flex items-center gap-3">
          <motion.div initial={wiggleIn.initial} animate={wiggleIn.animate} transition={{ ...SPRING_BOUNCY, delay: 0 }}>
            <IconButton onClick={onBack} aria-label="Back"><ChevronLeft size={18} className="text-[#1E1B4B]" /></IconButton>
          </motion.div>
          <p className="text-[15px] font-bold text-[#1E1B4B] truncate">Seller</p>
        </div>
        <div className="px-5 py-16 text-center">
          <p className="text-[13px] text-[#6B6483]">
            {loading ? "Loading this store\u2026" : error || "This store isn\u2019t available."}
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: DURATION.base, ease: EASE }}
      className="fixed inset-0 bg-[#FAFAFF] z-40 overflow-y-auto pb-10"
    >
      <div className="sticky top-0 z-10 bg-[#FAFAFF]/95 backdrop-blur px-5 pt-4 pb-3 flex items-center gap-3">
        <motion.div initial={wiggleIn.initial} animate={wiggleIn.animate} transition={{ ...SPRING_BOUNCY, delay: 0 }}>
          <IconButton onClick={onBack} aria-label="Back"><ChevronLeft size={18} className="text-[#1E1B4B]" /></IconButton>
        </motion.div>
        <p className="text-[15px] font-bold text-[#1E1B4B] truncate">Seller</p>
      </div>

      {bannerUrl && (
        <motion.div
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: DURATION.slow, ease: EASE }}
          className="relative h-28 w-full mb-[-2.5rem] overflow-hidden"
        >
          <Image src={bannerUrl} alt="" fill sizes="100vw" className="object-cover" />
        </motion.div>
      )}

      <motion.div className="px-5" initial="hidden" animate="visible" variants={STAGGER_CONTAINER}>
        <motion.div variants={STAGGER_ITEM} className="flex items-center gap-3 mb-4">
          <div
            className="relative w-14 h-14 rounded-full flex items-center justify-center shrink-0 text-white text-[20px] font-bold overflow-hidden border-2 border-white shadow-md"
            style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
          >
            {logoUrl ? <Image src={logoUrl} alt="" fill sizes="56px" className="object-cover" /> : sellerName?.[0]?.toUpperCase() || "?"}
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
        </motion.div>

        {/* The dedicated storefront. Present only while the seller's paid
            plan actually publishes it — lib/sellerPublicProfile.ts returns
            null for storeSlug otherwise, so this never advertises a link
            that would land on a closed store. */}
        {profile.storeSlug && (
          <motion.a
            variants={STAGGER_ITEM}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: DURATION.instant }}
            href={`/store/${profile.storeSlug}`}
            className="w-full flex items-center justify-center gap-2 text-white text-[13px] font-semibold py-3 rounded-xl mb-4"
            style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
          >
            <Store size={15} /> Visit store
          </motion.a>
        )}

        {profile.description && (
          <motion.p variants={STAGGER_ITEM} className="text-[12.5px] text-[#514B67] leading-relaxed mb-4">{profile.description}</motion.p>
        )}

        {(profile.completedOrderCount > 0 || profile.reviewCount > 0) && (
          <motion.div variants={STAGGER_ITEM} className="flex items-center gap-4 mb-5 text-[11px] text-[#6B6483]">
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
          </motion.div>
        )}

        {!isOwnProfile && (
          <motion.button
            variants={STAGGER_ITEM}
            {...press}
            onClick={async () => {
              setContacting(true);
              try {
                // sellerId (not just the name) — business_name has no
                // uniqueness constraint, so the name-only lookup this used
                // to send can throw on a real collision between two
                // sellers, the same reason every other "contact seller"
                // entry point in this app already prefers the id.
                await onContact({ seller: sellerName, sellerId: profile.id });
              } finally {
                setContacting(false);
              }
            }}
            disabled={contacting}
            className={`w-full flex items-center justify-center gap-2 text-white text-[13px] font-semibold py-3 rounded-xl mb-6 ${contacting ? "opacity-60" : ""}`}
            style={{ background: "#1E1B4B" }}
          >
            <MessageCircle size={15} /> {contacting ? "Opening…" : "Contact seller"}
          </motion.button>
        )}

        <motion.p variants={STAGGER_ITEM} className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <Package size={13} className="text-[#7C3AED]" /> Listings
        </motion.p>
        <motion.div variants={STAGGER_ITEM} className="grid grid-cols-2 gap-x-3 gap-y-5">
          {listings.map((p, i) => (
            <motion.button
              key={p.id}
              onClick={() => onOpenProduct(p)}
              initial={{ opacity: 0, y: 26, scale: 0.75, rotate: -4 }}
              animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
              transition={{ ...SPRING_BOUNCY, delay: i * 0.05 }}
              whileTap={{ scale: 0.94, rotate: i % 2 === 0 ? -2 : 2 }}
              className="text-left"
            >
              <div className="relative rounded-[20px] overflow-hidden mb-2">
                <ArtBlock icon={categoryGroup(p.category).icon} art={p.art} imageUrl={p.imageUrl} className="h-32 w-full" />
              </div>
              <p className="text-[12px] font-medium text-[#1E1B4B] leading-tight line-clamp-2 h-8 mb-0.5">{p.name}</p>
              <p className="text-[13px] font-bold text-[#1E1B4B]">{naira(p.price)}</p>
            </motion.button>
          ))}
          {listings.length === 0 && (
            <p className="col-span-2 text-center text-[13px] text-[#6B6483] py-10">No active listings right now.</p>
          )}
        </motion.div>

        {profile.reviews.length > 0 && (
          <motion.div {...revealOnView} className="mt-8">
            <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Star size={13} className="text-[#7C3AED]" /> Reviews
            </p>
            <div className="space-y-3">
              {profile.reviews.map((r) => (
                <div key={r.id} className="bg-white border border-[#ECE9F7] rounded-[16px] p-3.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star key={n} size={12} className={n <= r.rating ? "fill-[#F59E0B] text-[#F59E0B]" : "text-[#E4DFF5]"} />
                      ))}
                    </span>
                    <span className="text-[10.5px] text-[#8A8372]">
                      {new Date(r.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </div>
                  {r.comment && <p className="text-[12.5px] text-[#514B67] leading-relaxed">{r.comment}</p>}
                  {r.sellerReply && (
                    <div className="mt-2.5 pl-3 border-l-2 border-[#ECE9F7]">
                      <p className="text-[10.5px] font-semibold text-[#7C3AED] mb-0.5">Seller reply</p>
                      <p className="text-[12px] text-[#514B67] leading-relaxed">{r.sellerReply}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}
