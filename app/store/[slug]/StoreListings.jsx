"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { ArtBlock } from "../../../components/findit-app/shared";
import { categoryGroup } from "../../../components/findit-app/data";

// Number(...) coercion matches components/findit-app/data.js's shared naira()
// helper — degrades to ₦0/₦NaN instead of throwing if amount is ever not a
// plain number.
const naira = (amount) => `₦${Number(amount).toLocaleString("en-NG")}`;

// Client-side search/category filter over one seller's own listings — same
// search-box and pill-row styling as components/findit-app/Browse.jsx, so a
// buyer who came from inside the app and one who landed here from a shared
// link (this page is server-rendered and has no session, see page.tsx) get
// a consistent feel. Filtering happens entirely in the browser: a single
// seller's listing count never justifies a server round trip per keystroke.
//
// `density` is the one real structural lever a template gets over how its
// listings render: "cozy" (classic) is the original 2/3-col grid; "spacious"
// (gallery/showcase) is a 2-col grid with a taller image area AND a large
// featured first item, leaning all the way into "the product photography is
// the point"; "list" (compact) trades the grid for stacked rows — true to
// what "compact" is supposed to mean (less scrolling, not just less
// padding), the same row shape Cart.jsx already uses for a line item.
//
// accent carries the seller's curated color pair (see
// lib/subscriptions.ts#STORE_ACCENTS) — defaults to the original violet so
// a caller that doesn't pass one (there currently isn't one) still renders
// exactly as before.
const DEFAULT_ACCENT = { from: "#A855F7", to: "#7C3AED", tint: "#F1ECFD" };

function ProductThumb({ product, className }) {
  return <ArtBlock icon={categoryGroup(product.category).icon} art={product.art ?? 0} imageUrl={product.imageUrl} className={className} />;
}

function GridCard({ product, spacious }) {
  return (
    <Link href={`/?product=${encodeURIComponent(product.id)}`} className="block group">
      <div
        className={`relative rounded-[20px] overflow-hidden mb-2 transition-shadow duration-200 group-hover:shadow-lg group-hover:shadow-[#4C1D95]/15 ${spacious ? "h-44" : "h-32"}`}
      >
        <div className="absolute inset-0 transition-transform duration-300 ease-out group-hover:scale-[1.04]">
          <ProductThumb product={product} className="h-full w-full" />
        </div>
      </div>
      <p className={`font-medium text-[#1E1B4B] leading-tight line-clamp-2 transition-colors group-hover:text-[#7C3AED] ${spacious ? "text-[13.5px]" : "text-[12.5px]"}`}>
        {product.name}
      </p>
      <p className={`font-bold text-[#1E1B4B] mt-0.5 ${spacious ? "text-[14.5px]" : "text-[13px]"}`}>{naira(product.price)}</p>
    </Link>
  );
}

function FeaturedCard({ product, categoryLabel }) {
  return (
    <Link href={`/?product=${encodeURIComponent(product.id)}`} className="block group mb-5">
      <div className="relative rounded-[24px] overflow-hidden mb-3 h-56 sm:h-72 transition-shadow duration-200 group-hover:shadow-xl group-hover:shadow-[#4C1D95]/20">
        <div className="absolute inset-0 transition-transform duration-300 ease-out group-hover:scale-[1.03]">
          <ProductThumb product={product} className="h-full w-full" />
        </div>
        {categoryLabel && (
          <span className="absolute top-3 left-3 bg-white/95 text-[11px] font-semibold text-[#514B67] px-2.5 py-1 rounded-full">
            {categoryLabel}
          </span>
        )}
      </div>
      <p className="text-[16px] font-bold text-[#1E1B4B] leading-tight line-clamp-2 transition-colors group-hover:text-[#7C3AED]">{product.name}</p>
      <p className="text-[17px] font-bold text-[#1E1B4B] mt-0.5">{naira(product.price)}</p>
    </Link>
  );
}

function ListRow({ product, accent }) {
  return (
    <li>
      <Link
        href={`/?product=${encodeURIComponent(product.id)}`}
        className="group flex items-center gap-3 bg-white border border-[#ECE9F7] rounded-[18px] p-3 shadow-sm shadow-[#4C1D95]/5 transition-shadow hover:shadow-md hover:shadow-[#4C1D95]/10"
      >
        <div className="w-16 h-16 rounded-[14px] overflow-hidden shrink-0">
          <ProductThumb product={product} className="h-16 w-16" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-[#1E1B4B] leading-tight line-clamp-1 mb-0.5 transition-colors group-hover:text-[#7C3AED]">
            {product.name}
          </p>
          {product.condition && (
            <p className="text-[11px] text-[#8A8372]">{product.condition}</p>
          )}
        </div>
        <p className="text-[13.5px] font-bold text-[#1E1B4B] shrink-0" style={{ color: accent.to }}>
          {naira(product.price)}
        </p>
      </Link>
    </li>
  );
}

export default function StoreListings({ listings, categoryLabels, density = "cozy", accent = DEFAULT_ACCENT }) {
  const spacious = density === "spacious";
  const list = density === "list";
  const accentGradient = `linear-gradient(135deg,${accent.from},${accent.to})`;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  const categories = useMemo(() => {
    const seen = new Map();
    for (const p of listings) {
      if (!seen.has(p.category)) seen.set(p.category, categoryLabels[p.category] || p.category);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [listings, categoryLabels]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return listings.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q);
    });
  }, [listings, query, category]);

  if (listings.length === 0) {
    return (
      <div>
        <h2 className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3">0 listings</h2>
        <p className="text-[13px] text-[#6B6483] py-10 text-center bg-white border border-[#ECE9F7] rounded-2xl">
          This store has no active listings right now.
        </p>
      </div>
    );
  }

  // Gallery/showcase lean all the way into "the product is the point": the
  // first result (of whatever's currently filtered, so it stays correct as
  // the buyer searches/filters rather than freezing on the pre-filter item)
  // gets a large, full-width featured treatment; the rest follow in the
  // normal spacious grid.
  const [featured, rest] = spacious && filtered.length > 0 ? [filtered[0], filtered.slice(1)] : [null, filtered];

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide">
          {filtered.length === listings.length
            ? `${listings.length} listing${listings.length === 1 ? "" : "s"}`
            : `${filtered.length} of ${listings.length} listings`}
        </h2>
      </div>

      {listings.length > 4 && (
        <div className="flex-1 flex items-center gap-2 bg-white border border-[#ECE9F7] rounded-[20px] px-3 py-2.5 mb-3">
          <Search size={15} style={{ color: accent.to }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search this store's listings…`}
            className="flex-1 text-[13px] outline-none text-[#1E1B4B] placeholder:text-[#8A8372] bg-transparent min-w-0"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear search">
              <X size={14} className="text-[#8A8372]" />
            </button>
          )}
        </div>
      )}

      {categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-4" style={{ scrollbarWidth: "none" }}>
          <button
            onClick={() => setCategory("all")}
            className={`shrink-0 text-[12px] font-medium px-3.5 py-2 rounded-full border transition ${category === "all" ? "text-white border-transparent" : "bg-white text-[#514B67] border-[#ECE9F7]"}`}
            style={category === "all" ? { background: accentGradient } : {}}
          >
            All
          </button>
          {categories.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setCategory(key)}
              className={`shrink-0 text-[12px] font-medium px-3.5 py-2 rounded-full border transition ${category === key ? "text-white border-transparent" : "bg-white text-[#514B67] border-[#ECE9F7]"}`}
              style={category === key ? { background: accentGradient } : {}}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-[13px] text-[#6B6483] py-10 text-center bg-white border border-[#ECE9F7] rounded-2xl">
          No listings match {query ? `"${query}"` : "that category"}.
        </p>
      ) : list ? (
        <ul className="flex flex-col gap-2.5 list-none p-0 m-0">
          {filtered.map((product) => (
            <ListRow key={product.id} product={product} accent={accent} />
          ))}
        </ul>
      ) : (
        <>
          {featured && <FeaturedCard product={featured} categoryLabel={categoryLabels[featured.category] || featured.category} />}
          <ul className={`grid gap-x-4 gap-y-6 list-none p-0 m-0 ${spacious ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
            {rest.map((product) => (
              <li key={product.id}>
                <GridCard product={product} spacious={spacious} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
