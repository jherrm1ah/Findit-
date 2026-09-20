"use client";

// Split out from shared.jsx deliberately: these two need motion/react, and
// shared.jsx also exports plain, static pieces (Logo, Wordmark) used by
// app/privacy and app/terms — pages with no other reason to ship the
// animation library. Keeping the animated exports in their own client
// module means those static pages' bundle stays untouched by this file.

import { useEffect, useRef } from "react";
import { motion, useAnimate } from "motion/react";
import { Heart } from "lucide-react";
import { press, EASE } from "./motion";

export function IconButton({ children, onClick, badge, "aria-label": ariaLabel }) {
  return (
    <motion.button
      onClick={onClick}
      aria-label={ariaLabel}
      {...press}
      className="relative w-11 h-11 rounded-full bg-white shadow-md shadow-[#4C1D95]/10 flex items-center justify-center shrink-0"
    >
      {children}
      {badge && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#F59E0B] text-white text-[9px] font-bold flex items-center justify-center">{badge}</span>}
    </motion.button>
  );
}

// The heart on every product card, ProductDetail, and anywhere else a
// buyer can save an item — one implementation so "favorite" always feels
// the same everywhere it appears. Presses always give tactile feedback;
// the satisfying pop plays only on the false->true transition (favoriting
// is the delightful direction — un-favoriting just fades, no bounce).
export function FavoriteButton({ saved, onToggle, className = "", size = 14 }) {
  const [scope, animate] = useAnimate();
  const prevSaved = useRef(saved);

  useEffect(() => {
    if (saved && !prevSaved.current && scope.current) {
      animate(scope.current, { scale: [1, 1.35, 0.9, 1] }, { duration: 0.32, ease: EASE });
    }
    prevSaved.current = saved;
  }, [saved, animate, scope]);

  return (
    <motion.button
      onClick={onToggle}
      aria-label={saved ? "Remove from saved items" : "Save item"}
      aria-pressed={saved}
      {...press}
      className={className}
    >
      <span ref={scope} className="flex">
        <Heart size={size} className={saved ? "fill-[#E64980] text-[#E64980]" : "text-[#8A8372]"} />
      </span>
    </motion.button>
  );
}
