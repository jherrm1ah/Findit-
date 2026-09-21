"use client";

import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, Minus, Plus, X, ShoppingCart } from "lucide-react";
import { categoryGroup, naira } from "./data";
import { ArtBlock } from "./shared";
import { IconButton } from "./sharedMotion";
import { AnimatedNumber, DURATION, EASE, SPRING_SNAPPY, SPRING_BOUNCY, press, wiggleIn } from "./motion";

// A bouncier stagger for the cart line items' entrance — screen-local, like
// Home's BOUNCE_CONTAINER/ITEM, not a change to STAGGER_CONTAINER/ITEM
// themselves.
const BOUNCE_CONTAINER = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };
const BOUNCE_ITEM = {
  hidden: { opacity: 0, y: 26, scale: 0.75, rotate: -4 },
  visible: { opacity: 1, y: 0, scale: 1, rotate: 0, transition: SPRING_BOUNCY },
};

export default function Cart({ cart, products, onBack, go, onUpdateQty, onRemove, onCheckout, checkingOut }) {
  // A cart line can outlive its product (deactivated, removed, or the
  // catalogue snapshot just hasn't caught up yet) — skip it rather than
  // render a row for something that can't actually be bought, the same
  // "not found" tolerance the rest of this app already applies to a saved
  // or trending item that's disappeared from `products`.
  const lines = cart
    .map((c) => ({ ...c, product: products.find((p) => p.id === c.productId) }))
    .filter((l) => l.product);

  const subtotal = lines.reduce((sum, l) => sum + l.product.price * l.qty, 0);
  const itemCount = lines.reduce((n, l) => n + l.qty, 0);

  return (
    <div className="fixed inset-0 bg-[#FAFAFF] z-40 flex flex-col">
      <div className="sticky top-0 z-10 bg-[#FAFAFF]/95 backdrop-blur px-5 pt-4 pb-3 flex items-center gap-3 shrink-0">
        <motion.div initial={wiggleIn.initial} animate={wiggleIn.animate} transition={{ ...SPRING_BOUNCY, delay: 0 }}>
          <IconButton onClick={onBack} aria-label="Back"><ChevronLeft size={18} className="text-[#1E1B4B]" /></IconButton>
        </motion.div>
        <p className="text-[15px] font-bold text-[#1E1B4B]">Cart</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5">
        {lines.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.base, ease: EASE }}
            className="flex flex-col items-center text-center pt-16"
          >
            <div className="w-14 h-14 rounded-full bg-[#F5F2FC] flex items-center justify-center mb-4">
              <ShoppingCart size={22} className="text-[#7C3AED]" />
            </div>
            <p className="text-[14px] font-semibold text-[#1E1B4B] mb-1">Your cart is empty</p>
            <p className="text-[12px] text-[#6B6483] mb-5 max-w-[240px]">Add something from the catalogue to see it here.</p>
            <motion.button
              onClick={() => go("browse")}
              {...press}
              className="text-[12.5px] font-semibold text-white px-5 py-2.5 rounded-full"
              style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
            >
              Browse the catalogue
            </motion.button>
          </motion.div>
        ) : (
          <motion.div className="space-y-3 pb-6" initial="hidden" animate="visible" variants={BOUNCE_CONTAINER}>
            <AnimatePresence>
              {lines.map((l) => (
                <motion.div
                  key={l.productId}
                  layout="position"
                  variants={BOUNCE_ITEM}
                  exit={{ opacity: 0, x: -40, transition: { duration: DURATION.fast, ease: EASE } }}
                  className="flex items-center gap-3 bg-white border border-[#ECE9F7] rounded-[18px] p-3 shadow-sm shadow-[#4C1D95]/5"
                >
                  <div className="w-16 h-16 rounded-[14px] overflow-hidden shrink-0">
                    <ArtBlock icon={categoryGroup(l.product.category).icon} art={l.product.art} imageUrl={l.product.imageUrl} className="h-16 w-16" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-medium text-[#1E1B4B] leading-tight line-clamp-1 mb-0.5">{l.product.name}</p>
                    <p className="text-[11px] text-[#6B6483] mb-1.5">{l.product.seller}</p>
                    <p className="text-[13px] font-bold text-[#1E1B4B]">{naira(l.product.price)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <motion.button whileTap={{ scale: 0.85 }} transition={SPRING_SNAPPY} onClick={() => onRemove(l.productId)} aria-label="Remove from cart">
                      <X size={15} className="text-[#8A8372]" />
                    </motion.button>
                    <div className="flex items-center gap-2 bg-[#F5F2FC] rounded-xl px-1.5 py-1">
                      <motion.button
                        whileTap={{ scale: 0.85 }}
                        transition={SPRING_SNAPPY}
                        onClick={() => onUpdateQty(l.productId, l.qty - 1)}
                        className="w-6 h-6 rounded-lg bg-white flex items-center justify-center shadow-sm"
                        aria-label="Decrease quantity"
                      >
                        <Minus size={11} className="text-[#1E1B4B]" />
                      </motion.button>
                      <AnimatedNumber value={l.qty} duration={DURATION.fast} className="text-[12.5px] font-semibold text-[#1E1B4B] w-4 text-center" />
                      <motion.button
                        whileTap={{ scale: 0.85 }}
                        transition={SPRING_SNAPPY}
                        onClick={() => onUpdateQty(l.productId, l.qty + 1)}
                        className="w-6 h-6 rounded-lg bg-white flex items-center justify-center shadow-sm"
                        aria-label="Increase quantity"
                      >
                        <Plus size={11} className="text-[#1E1B4B]" />
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {lines.length > 0 && (
          <motion.div
            initial={{ y: 90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 90, opacity: 0 }}
            transition={{ duration: DURATION.base, ease: EASE }}
            className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#ECE9F7] px-5 py-4 flex items-center justify-between z-50"
          >
            <div>
              <p className="text-[11px] text-[#8A8372]">Subtotal · {itemCount} item{itemCount === 1 ? "" : "s"}</p>
              <AnimatedNumber value={subtotal} format={(n) => naira(Math.round(n))} className="text-[19px] font-bold text-[#1E1B4B]" />
            </div>
            <motion.button
              onClick={onCheckout}
              disabled={checkingOut}
              {...press}
              className={`text-white text-[13px] font-semibold px-6 py-3 rounded-full shadow-lg shadow-[#7C3AED]/25 ${checkingOut ? "opacity-60" : ""}`}
              style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
            >
              {checkingOut ? "Placing orders…" : "Checkout"}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
