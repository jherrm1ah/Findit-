"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronLeft, ShoppingBag, ShoppingCart, User, BadgeCheck, Star, Check,
  Minus, Plus, MapPin, Truck, Package as PackageIcon, Palette, Flag,
} from "lucide-react";
import { categoryGroup, naira } from "./data";
import { ArtBlock, Pill } from "./shared";
import { IconButton, FavoriteButton } from "./sharedMotion";
import { haversineKm, formatDistanceKm } from "@/lib/geo";
import { DURATION, EASE, SPRING_SNAPPY, press, STAGGER_CONTAINER, STAGGER_ITEM } from "./motion";

// Matches lib/productReports.ts#REPORT_REASON_LABELS (migration 027) — kept
// as a small duplicated client-side list rather than a network round trip
// just to populate a reason picker.
const REPORT_REASONS = [
  { value: "prohibited_item", label: "Prohibited item" },
  { value: "counterfeit", label: "Possible counterfeit" },
  { value: "scam", label: "Possible scam" },
  { value: "spam", label: "Spam" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "other", label: "Other" },
];

export default function ProductDetail({ product, onClose, go, onBuyNow, onAddToCart, onContact, onViewSeller, savedIds, onToggleSaved, myLocation, onReportProduct, showToast }) {
  const [qty, setQty] = useState(1);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [contacting, setContacting] = useState(false);
  const [buying, setBuying] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  // { key, rect } | null — a short-lived flourish, not real UI state: a
  // small clone of the product photo lifts off from the button and shrinks
  // away, giving "add to cart" a sense of the item actually going
  // somewhere rather than just a toast appearing.
  const [flyItem, setFlyItem] = useState(null);
  const addToCartRef = useRef(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0].value);
  const [reportDetails, setReportDetails] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  if (!product) return null;

  const submitReport = async () => {
    setReportSubmitting(true);
    try {
      await onReportProduct(product.id, reportReason, reportDetails);
      setReportSubmitted(true);
      setReportOpen(false);
    } catch (err) {
      showToast?.(err.message || "Couldn't submit that report.", "error");
    } finally {
      setReportSubmitting(false);
    }
  };
  const Icon = categoryGroup(product.category).icon;
  const total = product.price * qty;
  const km = myLocation && product.lat != null && product.lng != null
    ? haversineKm(myLocation.lat, myLocation.lng, product.lat, product.lng)
    : null;
  // Falls back to the single cover photo for a product object that hasn't
  // gone through the real bulk-image load (see lib/repo.ts#productImagesForIds)
  // — never actually empty when a listing has any photo at all.
  const photos = product.images?.length ? product.images : product.imageUrl ? [product.imageUrl] : [];
  const activePhoto = photos[photoIndex] ?? null;

  return (
    <motion.div
      className="fixed inset-0 bg-[#FAFAFF] z-40 overflow-y-auto pb-28"
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: DURATION.base, ease: EASE }}
    >
      <div className="sticky top-0 z-10 bg-[#FAFAFF]/90 backdrop-blur px-5 pt-4 pb-3 flex items-center justify-between">
        <IconButton onClick={onClose} aria-label="Back"><ChevronLeft size={18} className="text-[#1E1B4B]" /></IconButton>
        <p className="text-[15px] font-bold text-[#1E1B4B]">Details</p>
        <IconButton onClick={() => go("request")} aria-label="Request an item"><ShoppingBag size={17} className="text-[#1E1B4B]" /></IconButton>
      </div>

      <div className="px-5">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: DURATION.base, ease: EASE, delay: 0.03 }}
          className={`relative rounded-[20px] overflow-hidden ${photos.length > 1 ? "mb-3" : "mb-5"}`}
        >
          <ArtBlock icon={Icon} art={product.art} imageUrl={activePhoto} className="h-64 w-full" />
          {/* Tap the left/right third of the photo to step through the
              gallery — no swipe library, just two transparent hit zones. */}
          {photos.length > 1 && (
            <>
              <button
                onClick={() => setPhotoIndex((i) => (i - 1 + photos.length) % photos.length)}
                aria-label="Previous photo"
                className="absolute left-0 top-0 bottom-0 w-1/3"
              />
              <button
                onClick={() => setPhotoIndex((i) => (i + 1) % photos.length)}
                aria-label="Next photo"
                className="absolute right-0 top-0 bottom-0 w-1/3"
              />
            </>
          )}
        </motion.div>
        {photos.length > 1 && (
          <div className="flex justify-center gap-1.5 mb-5">
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={() => setPhotoIndex(i)}
                aria-label={`Photo ${i + 1} of ${photos.length}`}
                aria-current={i === photoIndex}
                className={`h-1.5 rounded-full transition-all ${i === photoIndex ? "w-5 bg-[#7C3AED]" : "w-1.5 bg-[#D9D2EF]"}`}
              />
            ))}
          </div>
        )}

        <motion.div initial="hidden" animate="visible" variants={STAGGER_CONTAINER}>
        <motion.div variants={STAGGER_ITEM} className="flex items-start justify-between mb-1">
          <p className="text-[12px] text-[#8A8372]">{categoryGroup(product.category).label}</p>
          <FavoriteButton
            saved={savedIds.includes(product.id)}
            onToggle={() => onToggleSaved(product.id)}
            className="w-8 h-8 rounded-full bg-white shadow-sm shadow-[#4C1D95]/10 flex items-center justify-center shrink-0 -mt-1"
          />
        </motion.div>
        <motion.h1 variants={STAGGER_ITEM} className="text-[22px] font-bold text-[#1E1B4B] mb-3" style={{ fontFamily: "Fraunces, serif" }}>{product.name}</motion.h1>

        <motion.div variants={STAGGER_ITEM} className="flex items-center justify-between mb-5">
          {/* Opens the storefront by seller_id where the listing has one —
              the only key that can't confuse two sellers sharing a business
              name. Listings predating migration 009's backfill still have
              none, so they fall back to the name and the server decides
              whether that name is unambiguous enough to resolve. */}
          <button onClick={() => onViewSeller(product.sellerId || product.seller)} className="flex items-center gap-2.5 text-left">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}>
              <User size={17} className="text-white" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-[#1E1B4B] flex items-center gap-1">
                {product.seller} {product.verified && <BadgeCheck size={13} className="text-[#7C3AED]" />}
              </p>
              <p className="text-[11px] text-[#8A8372] flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1">
                  {product.rating != null ? (
                    <><Star size={10} className="fill-[#F59E0B] text-[#F59E0B]" /> {product.rating}</>
                  ) : (
                    "No ratings yet"
                  )}
                </span>
                {km != null && (
                  <span className="flex items-center gap-1 text-[#7C3AED] font-medium"><MapPin size={10} /> {formatDistanceKm(km)}</span>
                )}
              </p>
            </div>
          </button>
          <button
            onClick={async () => {
              setContacting(true);
              try {
                await onContact(product);
              } finally {
                setContacting(false);
              }
            }}
            disabled={contacting}
            className={`text-[12px] font-semibold px-4 py-2 rounded-full text-white flex items-center gap-1.5 shrink-0 ${contacting ? "opacity-60" : ""}`}
            style={{ background: "#1E1B4B" }}
          >
            {contacting ? "Opening…" : "Contact"}
          </button>
        </motion.div>

        {/* What the seller actually declared about THIS specific listing —
            distinct from the "condition you want" picker below, which is
            what the buyer asks for at purchase time. Only rendered when the
            seller actually set it (see migration 026: nullable, no
            default, an old unedited listing has no honest answer here). */}
        {(product.condition || product.deliveryOption || product.color || product.variation || product.location || product.qty != null) && (
          <motion.div variants={STAGGER_ITEM} className="flex gap-1.5 flex-wrap mb-4">
            {product.condition && <Pill tone={product.condition === "New" ? "green" : "gold"}>{product.condition}</Pill>}
            {product.qty != null && (
              <Pill tone={product.qty > 0 ? "stone" : "red"}>
                <PackageIcon size={11} /> {product.qty > 0 ? `${product.qty} available` : "Out of stock"}
              </Pill>
            )}
            {product.deliveryOption && <Pill tone="stone"><Truck size={11} /> {product.deliveryOption}</Pill>}
            {product.color && <Pill tone="stone"><Palette size={11} /> {product.color}</Pill>}
            {product.variation && <Pill tone="stone">{product.variation}</Pill>}
            {product.location && <Pill tone="stone"><MapPin size={11} /> {product.location}</Pill>}
          </motion.div>
        )}

        <motion.div variants={STAGGER_ITEM} className="flex items-center justify-end mb-6">
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
        </motion.div>

        <motion.div variants={STAGGER_ITEM}>
          <p className="text-[12px] font-semibold text-[#1E1B4B] mb-2">Description</p>
          <p className="text-[13px] leading-relaxed text-[#514B67] mb-4">
            {product.description
              ? product.description
              : "The seller hasn't added a description yet. Payment is held by FindIt until you confirm delivery, so you never pay a seller directly."}
          </p>
        </motion.div>

        <motion.div variants={STAGGER_ITEM} className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <div className="flex gap-1.5 flex-wrap">
            {product.verified ? <Pill tone="green"><BadgeCheck size={11} /> Verified seller</Pill> : <Pill tone="stone">Unverified seller</Pill>}
          </div>
          {reportSubmitted ? (
            <p className="text-[11px] text-[#6B6483] flex items-center gap-1"><Flag size={11} /> Reported — we're reviewing it.</p>
          ) : (
            <button
              onClick={() => setReportOpen((v) => !v)}
              className="text-[11px] text-[#8A8372] flex items-center gap-1"
            >
              <Flag size={11} /> Report this listing
            </button>
          )}
        </motion.div>
        </motion.div>

        {reportOpen && !reportSubmitted && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: DURATION.fast, ease: EASE }}
            className="bg-[#FDF6EC] border border-[#F5D9A8] rounded-2xl p-3.5 mb-4 overflow-hidden">
            <p className="text-[11.5px] font-semibold text-[#1E1B4B] mb-2">What's wrong with this listing?</p>
            <select
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className="w-full text-[12.5px] border border-[#ECE9F7] rounded-lg px-2.5 py-2 outline-none mb-2 bg-white"
            >
              {REPORT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <textarea
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              placeholder="Optional details"
              rows={2}
              maxLength={1000}
              className="w-full text-[12.5px] border border-[#ECE9F7] rounded-lg px-2.5 py-2 outline-none mb-2 bg-white resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={submitReport}
                disabled={reportSubmitting}
                className={`flex-1 text-white text-[12px] font-semibold py-2 rounded-xl ${reportSubmitting ? "opacity-60" : ""}`}
                style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
              >
                {reportSubmitting ? "Submitting…" : "Submit report"}
              </button>
              <button
                onClick={() => setReportOpen(false)}
                disabled={reportSubmitting}
                className="flex-1 bg-white border border-[#ECE9F7] text-[#6B6483] text-[12px] font-semibold py-2 rounded-xl"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </div>

      <motion.div
        initial={{ y: 90, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 90, opacity: 0 }}
        transition={{ duration: DURATION.base, ease: EASE, delay: 0.06 }}
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#ECE9F7] px-5 py-4 flex items-center justify-between gap-3 z-50"
      >
        <div>
          <p className="text-[11px] text-[#8A8372]">Total price</p>
          <p className="text-[19px] font-bold text-[#1E1B4B]">{naira(total)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onAddToCart && (
            <motion.button
              ref={addToCartRef}
              onClick={async () => {
                const rect = addToCartRef.current?.getBoundingClientRect();
                setAddingToCart(true);
                try {
                  await onAddToCart(product, qty);
                  if (rect) setFlyItem({ key: Date.now(), rect });
                  setJustAdded(true);
                  setTimeout(() => setJustAdded(false), 900);
                } finally {
                  setAddingToCart(false);
                }
              }}
              disabled={addingToCart || product.qty === 0}
              aria-label="Add to cart"
              {...press}
              className={`w-12 h-12 rounded-full border flex items-center justify-center shrink-0 ${justAdded ? "border-[#16A34A]/40 bg-[#16A34A]/10" : "border-[#7C3AED]/30"} ${addingToCart || product.qty === 0 ? "opacity-40" : ""}`}
            >
              <AnimatePresence mode="wait" initial={false}>
                {justAdded ? (
                  <motion.span
                    key="check"
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    transition={SPRING_SNAPPY}
                    className="flex"
                  >
                    <Check size={18} className="text-[#16A34A]" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="cart"
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    transition={SPRING_SNAPPY}
                    className="flex"
                  >
                    <ShoppingCart size={18} className="text-[#7C3AED]" />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          )}
          <motion.button
            onClick={async () => {
              setBuying(true);
              try {
                await onBuyNow(product, qty);
              } finally {
                setBuying(false);
              }
            }}
            disabled={buying || product.qty === 0}
            {...press}
            className={`flex items-center gap-2 text-white text-[13px] font-semibold pl-5 pr-6 py-3 rounded-full shadow-lg shadow-[#7C3AED]/25 ${buying || product.qty === 0 ? "opacity-60" : ""}`}
            style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
          >
            <ShoppingBag size={15} /> {product.qty === 0 ? "Out of stock" : buying ? "Placing order…" : "Buy now"}
          </motion.button>
        </div>
      </motion.div>

      <AnimatePresence>
        {flyItem && (
          <motion.div
            key={flyItem.key}
            className="fixed z-[70] rounded-full overflow-hidden pointer-events-none"
            style={{ left: flyItem.rect.left, top: flyItem.rect.top, width: flyItem.rect.width, height: flyItem.rect.height }}
            initial={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            animate={{ opacity: 0, scale: 0.2, x: 90, y: -320 }}
            transition={{ duration: 0.55, ease: EASE }}
            onAnimationComplete={() => setFlyItem(null)}
          >
            <ArtBlock icon={Icon} art={product.art} imageUrl={activePhoto} className="w-full h-full" />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
