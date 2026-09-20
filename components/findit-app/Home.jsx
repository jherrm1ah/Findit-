"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useAnimate } from "motion/react";
import {
  Search, PackageSearch, ShieldCheck, Truck, MessageCircle,
  ArrowRight, X, ChevronRight, Home as HomeIcon,
  ListOrdered, Bell, Menu, ShoppingBag, ShoppingCart, SlidersHorizontal,
  LayoutDashboard, MapPin, Store, Tag,
} from "lucide-react";
import { GROUPS, categoryGroup, naira } from "./data";
import { Logo, ArtBlock } from "./shared";
import { IconButton, FavoriteButton } from "./sharedMotion";
import { haversineKm } from "@/lib/geo";
import { AnimatedNumber, DURATION, EASE, SPRING_SNAPPY, STAGGER_CONTAINER, STAGGER_ITEM, revealOnView, press } from "./motion";

const BANNERS = [
  { tag: "Request-first", title: "Can't find it?\nAsk FindIt.", cta: "Request now", action: "request" },
  { tag: "Verified sellers", title: "Shop the\nfull catalogue.", cta: "Browse all", action: "browse" },
];

// A subtle pulse on the cart glyph itself, plus the badge popping in/out
// and its number counting rather than jumping — the "cart icon responds"
// half of the add-to-cart moment. Kept separate from the generic
// IconButton so this one animated case doesn't complicate every other
// header icon that has nothing to animate.
function CartIconButton({ count, onClick }) {
  const [iconScope, animateIcon] = useAnimate();
  const prevCount = useRef(count);

  useEffect(() => {
    if (count > prevCount.current && iconScope.current) {
      animateIcon(iconScope.current, { scale: [1, 1.2, 1] }, { duration: DURATION.base, ease: EASE });
    }
    prevCount.current = count;
  }, [count, animateIcon, iconScope]);

  return (
    <button
      onClick={onClick}
      aria-label="Cart"
      className="relative w-11 h-11 rounded-full bg-white shadow-md shadow-[#4C1D95]/10 flex items-center justify-center shrink-0"
    >
      <span ref={iconScope} className="flex">
        <ShoppingCart size={17} className="text-[#1E1B4B]" />
      </span>
      <AnimatePresence>
        {count > 0 && (
          <motion.span
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={SPRING_SNAPPY}
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-[#F59E0B] text-white text-[9px] font-bold flex items-center justify-center"
          >
            <AnimatedNumber value={count} />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

export default function Home({
  go, openProduct, products, unreadCount = 0, savedIds, onToggleSaved,
  myLocation, locationStatus, onEnableLocation, role,
  orders = [], myRequests = [], cartCount = 0,
}) {
  const [banner, setBanner] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [sellerSearch, setSellerSearch] = useState("");

  // The one thing this screen used to have no room for: what's actually
  // happening with the buyer's own stuff, as opposed to generic browsing.
  // Only the two states that need a decision or are worth a status check —
  // an order still in flight, or a request with an offer waiting to be
  // reviewed — not every order ever placed or every request ever sent.
  const activeOrder = [...orders]
    .filter((o) => o.status !== "Delivered")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  const requestWithOffers = [...myRequests]
    .filter((r) => r.status === "open" && r.offers?.length > 0)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

  // With a real location, show the newest listings sorted nearest-first;
  // without one, fall back to plain recency (the API's default order) —
  // there's no hardcoded city to fall back to. Either way, a final stable
  // sort pulls Business/Pro sellers' listings to the front as a group
  // (real placement for the Store subscription "featured" benefit — see
  // sortFeaturedFirst in lib/repo.ts) without disturbing the near-you order
  // within each group, since Array.sort is stable.
  const trending = (
    myLocation
      ? [...products]
          .map((p) => ({ ...p, _km: p.lat != null && p.lng != null ? haversineKm(myLocation.lat, myLocation.lng, p.lat, p.lng) : Infinity }))
          .sort((a, b) => a._km - b._km)
      : [...products]
  )
    .sort((a, b) => Number(b.sellerFeatured) - Number(a.sellerFeatured))
    .slice(0, 8);

  // Same products+savedIds intersection Account.jsx's "Saved items" section
  // already uses — a buyer who hearts something otherwise has no reminder of
  // it anywhere until they happen to go looking in Account.
  const saved = products.filter((p) => savedIds.includes(p.id));

  // The seller and admin entries are filtered by role rather than shown to
  // everyone. Neither ever granted access — both screens and every route
  // behind them check the role server-side — but listing an admin queue in a
  // buyer's menu only advertises a door they can't open.
  const MENU_LINKS = [
    { label: "Home", screen: "home", icon: HomeIcon },
    { label: "Browse catalogue", screen: "browse", icon: Search },
    { label: "Browse sellers", screen: "sellers", icon: Store },
    { label: "Cart", screen: "cart", icon: ShoppingCart },
    { label: "Request an item", screen: "request", icon: PackageSearch },
    { label: "My orders & saved items", screen: "account", icon: ListOrdered },
    { label: "Notifications", screen: "notifications", icon: Bell },
    role === "seller" && { label: "Seller dashboard", screen: "seller", icon: LayoutDashboard },
    role === "admin" && { label: "Admin queue", screen: "admin", icon: ShieldCheck },
  ].filter(Boolean);

  return (
    <div className="px-5 pt-4 pb-10">
      {/* floating icon header */}
      <div className="flex items-center justify-between mb-5 relative">
        <IconButton onClick={() => setMenuOpen((m) => !m)} aria-label={menuOpen ? "Close menu" : "Open menu"}>
          {menuOpen ? <X size={18} className="text-[#1E1B4B]" /> : <Menu size={18} className="text-[#1E1B4B]" />}
        </IconButton>
        <div className="flex items-center gap-1.5">
          <Logo size={22} />
          <span className="text-[11px] uppercase tracking-[0.15em] text-[#6B6483] font-medium">
            {myLocation ? "Near you" : "FindIt"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <IconButton onClick={() => go("notifications")} badge={unreadCount > 0 ? String(unreadCount) : undefined} aria-label="Notifications"><Bell size={17} className="text-[#1E1B4B]" /></IconButton>
          <CartIconButton count={cartCount} onClick={() => go("cart")} />
          <IconButton onClick={() => go("request")} aria-label="Request an item"><ShoppingBag size={18} className="text-[#1E1B4B]" /></IconButton>
        </div>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
            <div className="absolute top-14 left-0 z-40 bg-white rounded-[20px] shadow-xl shadow-[#4C1D95]/15 border border-[#ECE9F7] p-2 w-56">
              {MENU_LINKS.map((m) => (
                <button
                  key={m.screen}
                  onClick={() => { setMenuOpen(false); go(m.screen); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] text-[#1E1B4B] font-medium hover:bg-[#F5F2FC] text-left"
                >
                  <m.icon size={15} className="text-[#7C3AED]" /> {m.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* search */}
      <div className="flex items-center gap-2 bg-white rounded-full pl-4 pr-1.5 py-1.5 shadow-md shadow-[#4C1D95]/10 mb-5">
        <Search size={17} className="text-[#8A8372]" />
        <button onClick={() => go("browse")} className="flex-1 text-left text-[13px] text-[#8A8372] py-1.5">what are you looking for?</button>
        <button onClick={() => go("browse")} aria-label="Search and filter" className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}>
          <SlidersHorizontal size={14} className="text-white" />
        </button>
      </div>

      {!myLocation && !bannerDismissed && locationStatus !== "denied" && locationStatus !== "unsupported" && (
        <div className="flex items-center gap-3 bg-[#F5F2FC] border border-[#ECE9F7] rounded-[16px] px-4 py-3 mb-5">
          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0">
            <MapPin size={15} className="text-[#7C3AED]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-[#1E1B4B]">See what's near you</p>
            <p className="text-[10.5px] text-[#6B6483]">Turn on location to sort listings and sellers by distance.</p>
          </div>
          <button
            onClick={onEnableLocation}
            disabled={locationStatus === "requesting"}
            className={`text-[11.5px] font-semibold text-white px-3 py-1.5 rounded-full shrink-0 ${locationStatus === "requesting" ? "opacity-60" : ""}`}
            style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
          >
            {locationStatus === "requesting" ? "…" : "Allow"}
          </button>
          <button onClick={() => setBannerDismissed(true)} aria-label="Dismiss" className="shrink-0">
            <X size={14} className="text-[#8A8372]" />
          </button>
        </div>
      )}

      {(activeOrder || requestWithOffers) && (
        <div className="space-y-2 mb-6">
          {activeOrder && (
            <button
              onClick={() => go("account")}
              className="w-full flex items-center gap-3 bg-white border border-[#ECE9F7] rounded-[16px] px-4 py-3 text-left shadow-sm shadow-[#4C1D95]/5"
            >
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}>
                <Truck size={15} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-[#1E1B4B] truncate">Order from {activeOrder.seller}</p>
                <p className="text-[10.5px] text-[#6B6483]">{activeOrder.status}</p>
              </div>
              <ChevronRight size={16} className="text-[#7C3AED] shrink-0" />
            </button>
          )}
          {requestWithOffers && (
            <button
              onClick={() => go("myRequests")}
              className="w-full flex items-center gap-3 bg-white border border-[#ECE9F7] rounded-[16px] px-4 py-3 text-left shadow-sm shadow-[#4C1D95]/5"
            >
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-[#F5F2FC]">
                <Tag size={15} className="text-[#7C3AED]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-[#1E1B4B] truncate">{requestWithOffers.title}</p>
                <p className="text-[10.5px] text-[#6B6483]">
                  {requestWithOffers.offers.length} offer{requestWithOffers.offers.length === 1 ? "" : "s"} waiting for you
                </p>
              </div>
              <ChevronRight size={16} className="text-[#7C3AED] shrink-0" />
            </button>
          )}
        </div>
      )}

      {/* promo carousel */}
      <div
        className="rounded-[20px] p-6 relative overflow-hidden text-white mb-6 cursor-pointer"
        style={{ background: "linear-gradient(135deg,#7C3AED 0%,#5B21B6 60%,#3B1874 100%)", minHeight: 190 }}
        onClick={() => go(BANNERS[banner].action)}
      >
        <div className="absolute -right-8 -bottom-10 w-40 h-40 rounded-full bg-white/10" />
        <div className="absolute right-10 top-4 w-16 h-16 rounded-full bg-[#F59E0B]/25" />
        <span className="inline-block bg-white/15 backdrop-blur text-[10px] font-semibold px-3 py-1.5 rounded-full mb-4">{BANNERS[banner].tag}</span>
        <h2 className="text-[24px] font-bold leading-[1.15] mb-6 whitespace-pre-line relative" style={{ fontFamily: "Fraunces, serif" }}>
          {BANNERS[banner].title}
        </h2>
        <span className="inline-flex items-center gap-2 bg-[#1E1B4B] text-white text-[12px] font-semibold pl-4 pr-1.5 py-1.5 rounded-full relative">
          {BANNERS[banner].cta}
          <span className="w-6 h-6 rounded-full bg-white flex items-center justify-center">
            <ArrowRight size={12} className="text-[#1E1B4B] -rotate-45" />
          </span>
        </span>
        <div className="absolute bottom-4 right-6 flex gap-1.5">
          {BANNERS.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setBanner(i); }}
              aria-label={`Show promo ${i + 1} of ${BANNERS.length}`}
              aria-current={i === banner}
              className={`h-1.5 rounded-full transition-all ${i === banner ? "w-5 bg-white" : "w-1.5 bg-white/40"}`}
            />
          ))}
        </div>
      </div>

      {/* categories */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[15px] font-bold text-[#1E1B4B]">Categories</h2>
        <button onClick={() => go("browse")} className="text-[12px] text-[#7C3AED] font-medium">See all</button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 mb-7 -mx-5 px-5" style={{ scrollbarWidth: "none" }}>
        {Object.entries(GROUPS).slice(0, 8).map(([k, g]) => (
          <motion.button key={k} onClick={() => go("browse", k)} whileTap={{ scale: 0.92 }} transition={SPRING_SNAPPY} className="flex flex-col items-center gap-2 shrink-0 w-[76px]">
            <div className="w-[68px] h-[68px] rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#F0EAFC,#E4D9FA)" }}>
              <g.icon size={24} className="text-[#7C3AED]" strokeWidth={1.6} />
            </div>
            <span className="text-[10.5px] text-[#1E1B4B] font-medium text-center leading-tight line-clamp-2">{g.label}</span>
          </motion.button>
        ))}
      </div>

      {/* product grid */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[15px] font-bold text-[#1E1B4B]">{myLocation ? "Near you" : "New Listings"}</h2>
        <button onClick={() => go("browse")} className="text-[12px] text-[#7C3AED] font-medium">See all</button>
      </div>
      <motion.div
        className="grid grid-cols-2 gap-x-3 gap-y-5 mb-7"
        initial="hidden"
        animate="visible"
        variants={STAGGER_CONTAINER}
      >
        {trending.map((p) => (
          <motion.div key={p.id} variants={STAGGER_ITEM} className="relative text-left">
            <motion.button
              onClick={() => openProduct(p)}
              whileTap={{ scale: 0.96 }}
              transition={SPRING_SNAPPY}
              className="block w-full text-left"
              aria-label={`View ${p.name}`}
            >
              <div className="relative rounded-[20px] overflow-hidden mb-2">
                <ArtBlock icon={categoryGroup(p.category).icon} art={p.art} imageUrl={p.imageUrl} className="h-32 w-full" />
              </div>
              <p className="text-[12px] font-medium text-[#1E1B4B] leading-tight line-clamp-1 mb-0.5">{p.name}</p>
              <p className="text-[13px] font-bold text-[#1E1B4B]">{naira(p.price)}</p>
            </motion.button>
            <FavoriteButton
              saved={savedIds.includes(p.id)}
              onToggle={(e) => { e.stopPropagation(); onToggleSaved(p.id); }}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center"
            />
          </motion.div>
        ))}
        {trending.length === 0 && (
          <p className="col-span-2 text-center text-[13px] text-[#6B6483] py-8">
            No listings yet — be the first to sell on FindIt, or request an item to get the ball rolling.
          </p>
        )}
      </motion.div>

      {saved.length > 0 && (
        <motion.div {...revealOnView}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-bold text-[#1E1B4B]">Saved for you</h2>
            <button onClick={() => go("account")} className="text-[12px] text-[#7C3AED] font-medium">See all</button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 mb-7 -mx-5 px-5" style={{ scrollbarWidth: "none" }}>
            {saved.map((p) => (
              <motion.button key={p.id} onClick={() => openProduct(p)} whileTap={{ scale: 0.96 }} transition={SPRING_SNAPPY} className="text-left shrink-0 w-[120px]" aria-label={`View ${p.name}`}>
                <div className="relative rounded-[16px] overflow-hidden mb-2">
                  <ArtBlock icon={categoryGroup(p.category).icon} art={p.art} imageUrl={p.imageUrl} className="h-24 w-full" />
                </div>
                <p className="text-[11.5px] font-medium text-[#1E1B4B] leading-tight line-clamp-1 mb-0.5">{p.name}</p>
                <p className="text-[12.5px] font-bold text-[#1E1B4B]">{naira(p.price)}</p>
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}

      <motion.button {...revealOnView} onClick={() => go("browse")} className="w-full rounded-[20px] p-4 flex items-center justify-between text-left border border-[#ECE9F7] bg-white mb-3">
        <div>
          <p className="text-[13px] font-semibold text-[#1E1B4B]">See the full catalogue</p>
          <p className="text-[11px] text-[#6B6483]">All {products.length} products across {Object.keys(GROUPS).length} categories</p>
        </div>
        <ChevronRight size={18} className="text-[#7C3AED]" />
      </motion.button>

      {/* A buyer used to have to open "Browse sellers" first and search a
          second time inside it — go("sellers", query) below sends the term
          typed here straight into SellerDirectory's own results (see its
          initialQuery prop), so this one field actually finds a store. */}
      <motion.form
        {...revealOnView}
        onSubmit={(e) => {
          e.preventDefault();
          go("sellers", sellerSearch.trim());
        }}
        className="w-full rounded-[20px] p-4 border border-[#ECE9F7] bg-white mb-7"
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[13px] font-semibold text-[#1E1B4B]">Search stores</p>
            <p className="text-[11px] text-[#6B6483]">Every approved seller on FindIt, not just their listings</p>
          </div>
          <button type="button" onClick={() => go("sellers")} aria-label="Browse all sellers" className="shrink-0">
            <ChevronRight size={18} className="text-[#7C3AED]" />
          </button>
        </div>
        <div className="flex items-center gap-2 bg-[#F5F2FC] rounded-full px-3.5 py-2">
          <Store size={15} className="text-[#7C3AED] shrink-0" />
          <input
            value={sellerSearch}
            onChange={(e) => setSellerSearch(e.target.value)}
            placeholder="Search a seller's store…"
            className="flex-1 min-w-0 text-[13px] outline-none bg-transparent text-[#1E1B4B] placeholder:text-[#8A8372]"
          />
          <button
            type="submit"
            aria-label="Search sellers"
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
          >
            <Search size={13} className="text-white" />
          </button>
        </div>
      </motion.form>

      <h2 className="text-[15px] font-bold mb-4 text-[#1E1B4B]">How FindIt works</h2>
      <motion.div
        className="space-y-3"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-60px" }}
        variants={STAGGER_CONTAINER}
      >
        {[
          ["Tell FindIt what you need", MessageCircle],
          ["We search trusted sellers", Search],
          ["Compare offers & pay safely", ShieldCheck],
          ["Receive it, confirm delivery", Truck],
        ].map(([label, Icon], i) => (
          <motion.div key={i} variants={STAGGER_ITEM} className="flex items-center gap-3 bg-white border border-[#ECE9F7] rounded-[20px] p-3 shadow-sm shadow-[#4C1D95]/5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}>
              <Icon size={15} className="text-white" />
            </div>
            <p className="text-[13px] text-[#1E1B4B]">{label}</p>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
