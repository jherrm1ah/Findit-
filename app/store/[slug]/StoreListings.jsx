"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, X } from "lucide-react";

const naira = (amount) => `₦${amount.toLocaleString("en-NG")}`;

// Client-side search/category filter over one seller's own listings — same
// search-box and pill-row styling as components/findit-app/Browse.jsx, so a
// buyer who came from inside the app and one who landed here from a shared
// link (this page is server-rendered and has no session, see page.tsx) get
// a consistent feel. Filtering happens entirely in the browser: a single
// seller's listing count never justifies a server round trip per keystroke.
export default function StoreListings({ listings, categoryLabels }) {
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
          <Search size={15} className="text-[#7C3AED]" />
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
            style={category === "all" ? { background: "linear-gradient(135deg,#A855F7,#7C3AED)" } : {}}
          >
            All
          </button>
          {categories.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setCategory(key)}
              className={`shrink-0 text-[12px] font-medium px-3.5 py-2 rounded-full border transition ${category === key ? "text-white border-transparent" : "bg-white text-[#514B67] border-[#ECE9F7]"}`}
              style={category === key ? { background: "linear-gradient(135deg,#A855F7,#7C3AED)" } : {}}
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
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-6 list-none p-0 m-0">
          {filtered.map((product) => (
            <li key={product.id}>
              <Link href={`/?product=${encodeURIComponent(product.id)}`} className="block group">
                <div className="relative rounded-2xl overflow-hidden bg-[#EDE9FB] h-32 mb-2">
                  {product.imageUrl && (
                    <Image src={product.imageUrl} alt="" fill sizes="(max-width: 640px) 50vw, 33vw" className="object-cover" />
                  )}
                </div>
                <p className="text-[12.5px] font-medium text-[#1E1B4B] leading-tight line-clamp-2">{product.name}</p>
                <p className="text-[13px] font-bold text-[#1E1B4B] mt-0.5">{naira(product.price)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
