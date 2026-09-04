"use client";

import { useState } from "react";
import {
  Search, PackageSearch, ShieldCheck, Truck, MessageCircle,
  ArrowRight, X, ChevronRight, Home as HomeIcon, Sparkles,
  ListOrdered, Bell, Menu, ShoppingBag, Heart, SlidersHorizontal,
  LayoutDashboard,
} from "lucide-react";
import { GROUPS, naira } from "./data";
import { IconButton, Logo, ArtBlock } from "./shared";

const BANNERS = [
  { tag: "Request-first", title: "Can't find it?\nAsk FindIt.", cta: "Request now", action: "request" },
  { tag: "Verified sellers", title: "Shop the\nfull catalogue.", cta: "Browse all", action: "browse" },
];

export default function Home({ go, openProduct, products, unreadCount = 0, savedIds, onToggleSaved }) {
  const [banner, setBanner] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  // Products are already ordered newest-first by the API, so "trending" here
  // means "recently listed" — there's no real signal yet (like view/order
  // counts) to rank by anything fancier.
  const trending = products.slice(0, 8);

  const MENU_LINKS = [
    { label: "Home", screen: "home", icon: HomeIcon },
    { label: "Browse catalogue", screen: "browse", icon: Search },
    { label: "Request an item", screen: "request", icon: PackageSearch },
    { label: "My orders & saved items", screen: "account", icon: ListOrdered },
    { label: "Notifications", screen: "notifications", icon: Bell },
    { label: "Seller dashboard", screen: "seller", icon: LayoutDashboard },
    { label: "Admin queue", screen: "admin", icon: ShieldCheck },
  ];

  return (
    <div className="px-5 pt-4 pb-10">
      {/* floating icon header */}
      <div className="flex items-center justify-between mb-5 relative">
        <IconButton onClick={() => setMenuOpen((m) => !m)}>
          {menuOpen ? <X size={18} className="text-[#1E1B4B]" /> : <Menu size={18} className="text-[#1E1B4B]" />}
        </IconButton>
        <div className="flex items-center gap-1.5">
          <Logo size={22} />
          <span className="text-[11px] uppercase tracking-[0.15em] text-[#6B6483] font-medium">Nearest sellers</span>
        </div>
        <div className="flex items-center gap-2">
          <IconButton onClick={() => go("notifications")} badge={unreadCount > 0 ? String(unreadCount) : undefined}><Bell size={17} className="text-[#1E1B4B]" /></IconButton>
          <IconButton onClick={() => go("request")}><ShoppingBag size={18} className="text-[#1E1B4B]" /></IconButton>
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
        <button onClick={() => go("browse")} className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}>
          <SlidersHorizontal size={14} className="text-white" />
        </button>
      </div>

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
            <span key={i} onClick={(e) => { e.stopPropagation(); setBanner(i); }} className={`h-1.5 rounded-full transition-all ${i === banner ? "w-5 bg-white" : "w-1.5 bg-white/40"}`} />
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
          <button key={k} onClick={() => go("browse", k)} className="flex flex-col items-center gap-2 shrink-0 w-[76px]">
            <div className="w-[68px] h-[68px] rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#F0EAFC,#E4D9FA)" }}>
              <g.icon size={24} className="text-[#7C3AED]" strokeWidth={1.6} />
            </div>
            <span className="text-[10.5px] text-[#1E1B4B] font-medium text-center leading-tight line-clamp-2">{g.label}</span>
          </button>
        ))}
      </div>

      {/* product grid */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[15px] font-bold text-[#1E1B4B]">New Listings</h2>
        <button onClick={() => go("browse")} className="text-[12px] text-[#7C3AED] font-medium">See all</button>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-5 mb-7">
        {trending.map((p) => (
          <button key={p.id} onClick={() => openProduct(p)} className="text-left">
            <div className="relative rounded-[20px] overflow-hidden mb-2">
              <ArtBlock icon={GROUPS[p.category].icon} art={p.art} imageUrl={p.imageUrl} className="h-32 w-full" />
              <span onClick={(e) => { e.stopPropagation(); onToggleSaved(p.id); }} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                <Heart size={14} className={savedIds.includes(p.id) ? "fill-[#E64980] text-[#E64980]" : "text-[#8A8372]"} />
              </span>
            </div>
            <p className="text-[12px] font-medium text-[#1E1B4B] leading-tight line-clamp-1 mb-0.5">{p.name}</p>
            <p className="text-[13px] font-bold text-[#1E1B4B]">{naira(p.price)}</p>
          </button>
        ))}
        {trending.length === 0 && (
          <p className="col-span-2 text-center text-[13px] text-[#6B6483] py-8">
            No listings yet — be the first to sell on FindIt, or request an item to get the ball rolling.
          </p>
        )}
      </div>

      <button onClick={() => go("browse")} className="w-full rounded-[20px] p-4 flex items-center justify-between text-left border border-[#ECE9F7] bg-white mb-7">
        <div>
          <p className="text-[13px] font-semibold text-[#1E1B4B]">See the full catalogue</p>
          <p className="text-[11px] text-[#6B6483]">All {products.length} products across {Object.keys(GROUPS).length} categories</p>
        </div>
        <ChevronRight size={18} className="text-[#7C3AED]" />
      </button>

      <h2 className="text-[15px] font-bold mb-4 text-[#1E1B4B]">How FindIt works</h2>
      <div className="space-y-3">
        {[
          ["Tell FindIt what you need", MessageCircle],
          ["We search trusted sellers", Search],
          ["Compare offers & pay safely", ShieldCheck],
          ["Receive it, confirm delivery", Truck],
        ].map(([label, Icon], i) => (
          <div key={i} className="flex items-center gap-3 bg-white border border-[#ECE9F7] rounded-[20px] p-3 shadow-sm shadow-[#4C1D95]/5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}>
              <Icon size={15} className="text-white" />
            </div>
            <p className="text-[13px] text-[#1E1B4B]">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
