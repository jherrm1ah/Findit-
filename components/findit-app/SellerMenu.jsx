"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Menu as MenuIcon, X, Search, LayoutDashboard, Package, ClipboardList, Users, Send, Megaphone, Gift, BarChart3,
  Store, Crown, ChevronRight, Truck,
} from "lucide-react";
import { naira } from "./data";
import { DURATION, EASE } from "./motion";

// The seller dashboard's menu, grouped like a shop's back office: open it
// with the Menu button, search, or tap a section. Sub-items (All / Low stock
// / Boosted under Listings) go straight to that view.

// Where each menu entry leads: a dashboard section (tab, optionally a
// listings filter) or another screen of the app (screen).
const GROUPS = [
  {
    items: [{ key: "overview", label: "Home", icon: LayoutDashboard, target: { tab: "overview" }, keywords: "overview dashboard setup" }],
  },
  {
    title: "Sell",
    items: [
      {
        key: "listings", label: "Listings", icon: Package, target: { tab: "listings", listingFilter: "all" }, count: "listings",
        keywords: "products items stock",
        sub: [
          { key: "listings:all", label: "All listings", target: { tab: "listings", listingFilter: "all" }, count: "listings" },
          { key: "listings:low", label: "Low stock", target: { tab: "listings", listingFilter: "low" }, count: "low", keywords: "sold out inventory" },
          { key: "listings:boosted", label: "Boosted", target: { tab: "listings", listingFilter: "boosted" }, count: "boosted", keywords: "promote" },
        ],
      },
      { key: "orders", label: "Orders", icon: ClipboardList, target: { tab: "orders" }, count: "toFulfil", keywords: "sales deliver dispatch" },
      { key: "customers", label: "Customers", icon: Users, target: { tab: "customers" }, count: "customers", keywords: "buyers people" },
      { key: "requests", label: "Customer requests", icon: Send, target: { tab: "requests" }, count: "requests", keywords: "offers asks" },
    ],
  },
  {
    title: "Ship",
    items: [
      { key: "shipping", label: "Shipping & delivery", icon: Truck, target: { tab: "shipping" }, keywords: "delivery rates zones profiles pickup locations carriers free weight price local" },
    ],
  },
  {
    title: "Grow",
    items: [
      { key: "ads", label: "Ads", icon: Megaphone, target: { tab: "ads" }, keywords: "advertise campaign promote" },
      { key: "referrals", label: "Referrals", icon: Gift, target: { screen: "referrals" }, keywords: "invite credit earn" },
      { key: "analytics", label: "Analytics", icon: BarChart3, target: { tab: "analytics" }, keywords: "stats reports sales views" },
    ],
  },
  {
    title: "Store",
    items: [
      { key: "store", label: "Store settings", icon: Store, target: { tab: "store" }, keywords: "branding logo banner bank payout account reviews" },
      { key: "plan", label: "Plan", icon: Crown, target: { screen: "storePlans" }, keywords: "upgrade subscription pro" },
    ],
  },
];

// The label for where the seller is now, for the bar above the content.
export function currentLabel(tab, listingFilter) {
  if (tab === "listings") return listingFilter === "low" ? "Listings · Low stock" : listingFilter === "boosted" ? "Listings · Boosted" : "Listings";
  for (const g of GROUPS) for (const it of g.items) if (it.target.tab === tab) return it.key === "overview" ? "Home" : it.label;
  return "Home";
}

function isCurrent(target, tab, listingFilter) {
  if (!target.tab || target.tab !== tab) return false;
  return target.listingFilter ? target.listingFilter === listingFilter : true;
}

export default function SellerMenu({ open, onClose, tab, listingFilter, counts, onNavigate, listings, orders }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  // Search finds menu entries, and the seller's own listings and orders.
  const results = useMemo(() => {
    if (!q) return null;
    const entries = [];
    for (const g of GROUPS) {
      for (const it of g.items) {
        if (`${it.label} ${it.keywords ?? ""}`.toLowerCase().includes(q)) entries.push(it);
        for (const s of it.sub ?? []) if (`${s.label} ${s.keywords ?? ""}`.toLowerCase().includes(q)) entries.push({ ...s, icon: it.icon });
      }
    }
    const matchedListings = listings.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 4);
    const matchedOrders = orders.filter((o) => `${o.item} ${o.id}`.toLowerCase().includes(q)).slice(0, 4);
    return { entries, matchedListings, matchedOrders };
  }, [q, listings, orders]);

  const go = (target) => {
    onNavigate(target);
    setQuery("");
    onClose();
  };

  const Count = ({ name }) => {
    const n = counts[name] ?? 0;
    return n > 0 ? <span className="text-[10px] font-bold text-[#7C3AED] bg-[#F5F2FC] px-1.5 py-0.5 rounded-full">{n}</span> : null;
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.fast }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-[#1E1B4B]/30"
          />
          <motion.nav
            key="drawer"
            aria-label="Seller menu"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: DURATION.base, ease: EASE }}
            className="fixed top-0 bottom-0 left-0 z-[61] w-[86%] max-w-[340px] bg-[#FAFAFF] shadow-xl flex flex-col"
            style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <p className="text-[16px] font-bold text-[#1E1B4B]" style={{ fontFamily: "var(--font-fraunces), Fraunces, serif" }}>My store</p>
              <button onClick={onClose} aria-label="Close menu" className="p-1.5 -m-1.5 text-[#6B6483]">
                <X size={18} />
              </button>
            </div>
            <div className="px-4 pb-3">
              <label className="flex items-center gap-2 bg-white border border-[#ECE9F7] rounded-xl px-3 py-2.5">
                <Search size={15} className="text-[#8A8372] shrink-0" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search listings, orders, settings"
                  className="flex-1 bg-transparent text-[13px] text-[#1E1B4B] outline-none min-w-0"
                />
                {query && (
                  <button onClick={() => setQuery("")} aria-label="Clear search" className="text-[#8A8372]">
                    <X size={14} />
                  </button>
                )}
              </label>
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-6">
              {results ? (
                <div className="px-2">
                  {results.entries.length + results.matchedListings.length + results.matchedOrders.length === 0 && (
                    <p className="text-[12px] text-[#6B6483] px-2 py-3">Nothing matches &ldquo;{query}&rdquo;.</p>
                  )}
                  {results.entries.map((it) => {
                    const Icon = it.icon;
                    return (
                      <button key={it.key} onClick={() => go(it.target)} className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl text-left hover:bg-white">
                        <Icon size={16} className="text-[#7C3AED] shrink-0" />
                        <span className="flex-1 text-[13px] text-[#1E1B4B]">{it.label}</span>
                      </button>
                    );
                  })}
                  {results.matchedListings.length > 0 && (
                    <p className="text-[10.5px] font-semibold text-[#8A8372] uppercase tracking-wide px-2 pt-3 pb-1">Listings</p>
                  )}
                  {results.matchedListings.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => go({ tab: "listings", listingFilter: "all", search: p.name })}
                      className="w-full flex items-center justify-between gap-3 px-2 py-2 rounded-xl text-left hover:bg-white"
                    >
                      <span className="text-[13px] text-[#1E1B4B] truncate">{p.name}</span>
                      <span className="text-[11.5px] text-[#6B6483] shrink-0">{naira(p.price)}</span>
                    </button>
                  ))}
                  {results.matchedOrders.length > 0 && (
                    <p className="text-[10.5px] font-semibold text-[#8A8372] uppercase tracking-wide px-2 pt-3 pb-1">Orders</p>
                  )}
                  {results.matchedOrders.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => go({ tab: "orders", search: o.id })}
                      className="w-full flex items-center justify-between gap-3 px-2 py-2 rounded-xl text-left hover:bg-white"
                    >
                      <span className="text-[13px] text-[#1E1B4B] truncate">{o.item}</span>
                      <span className="text-[11px] text-[#6B6483] shrink-0">{o.status}</span>
                    </button>
                  ))}
                </div>
              ) : (
                GROUPS.map((g, gi) => (
                  <div key={gi} className={gi > 0 ? "mt-3" : ""}>
                    {g.title && <p className="text-[10.5px] font-semibold text-[#8A8372] uppercase tracking-wide px-4 pb-1">{g.title}</p>}
                    {g.items.map((it) => {
                      const Icon = it.icon;
                      const here = isCurrent(it.target, tab, listingFilter) && !it.sub;
                      const inside = it.sub && it.target.tab === tab;
                      return (
                        <div key={it.key}>
                          <button
                            onClick={() => go(it.target)}
                            aria-current={here ? "page" : undefined}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left ${here || inside ? "bg-white shadow-sm shadow-[#4C1D95]/5" : ""}`}
                          >
                            <Icon size={17} className="text-[#7C3AED] shrink-0" />
                            <span className={`flex-1 text-[13.5px] ${here || inside ? "font-semibold text-[#1E1B4B]" : "text-[#1E1B4B]"}`}>{it.label}</span>
                            {it.count && !it.sub && <Count name={it.count} />}
                            {it.target.screen && <ChevronRight size={14} className="text-[#B7AFD6] shrink-0" />}
                          </button>
                          {it.sub && (
                            <div className="ml-[42px] mr-2 mt-0.5 mb-1 border-l border-[#ECE9F7]">
                              {it.sub.map((s) => {
                                const subHere = isCurrent(s.target, tab, listingFilter);
                                return (
                                  <button
                                    key={s.key}
                                    onClick={() => go(s.target)}
                                    aria-current={subHere ? "page" : undefined}
                                    className={`w-full flex items-center gap-2 pl-3 pr-2 py-2 text-left text-[12.5px] ${subHere ? "font-semibold text-[#7C3AED]" : "text-[#514B67]"}`}
                                  >
                                    <span className="flex-1">{s.label}</span>
                                    <Count name={s.count} />
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </motion.nav>
        </>
      )}
    </AnimatePresence>
  );
}

// The bar above the dashboard content: the Menu button and where you are.
export function SellerMenuBar({ onOpen, label, attention }) {
  return (
    <div className="flex items-center gap-2.5 mb-6">
      <button
        onClick={onOpen}
        className="relative flex items-center gap-1.5 bg-white border border-[#ECE9F7] rounded-full pl-3 pr-3.5 py-2 text-[12.5px] font-semibold text-[#1E1B4B] shadow-sm shadow-[#4C1D95]/5"
      >
        <MenuIcon size={15} className="text-[#7C3AED]" /> Menu
        {attention > 0 && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#7C3AED] border-2 border-[#FAFAFF]" aria-label="Orders to fulfil" />}
      </button>
      <p className="text-[13px] font-semibold text-[#514B67] truncate">{label}</p>
    </div>
  );
}
