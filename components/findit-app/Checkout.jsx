"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { CreditCard, ShieldCheck, CheckCircle2 } from "lucide-react";
import { STEPS, naira } from "./data";
import { DURATION, EASE, SPRING_SOFT, press } from "./motion";

// Real payment, not a claim — the order sits "Awaiting payment" (see
// order.paymentStatus) until this screen's "Pay now" actually completes a
// Paystack charge, confirmed by app/api/payments/paystack/webhook. Nothing
// here marks the order paid on its own; the button only ever starts a real
// checkout or reports honestly that payments aren't configured yet.
export default function Checkout({ order, product, qty, onPay, showToast, go }) {
  const [paying, setPaying] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const total = product.price * qty;
  const alreadyPaid = order?.paymentStatus === "paid";
  const activeIdx = alreadyPaid ? 1 : 0;

  // The signature moment plays once — the first time this screen actually
  // witnesses paymentStatus flip to "paid", never on a later visit to an
  // order that was already paid (opening My orders and tapping into an old
  // paid order should never replay a "payment confirmed!" celebration).
  //
  // This is derived during render (not in an effect) so it's already true
  // on the very same render that first mounts the summary card/delivery
  // status blocks below — an effect-based flag would land one tick late,
  // after those blocks had already mounted with their "no animation" pose.
  const [prevAlreadyPaid, setPrevAlreadyPaid] = useState(alreadyPaid);
  const [justConfirmed, setJustConfirmed] = useState(false);
  if (alreadyPaid !== prevAlreadyPaid) {
    setPrevAlreadyPaid(alreadyPaid);
    if (alreadyPaid && !prevAlreadyPaid) setJustConfirmed(true);
  }

  const pay = async () => {
    if (!order) return;
    setPaying(true);
    try {
      const result = await onPay(order.id);
      if (result.configured === false) {
        setNotConfigured(true);
        showToast?.(result.message || "Payments aren't set up yet — contact the seller directly.", "error");
      } else if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      }
    } catch (err) {
      showToast?.(err.message || "Couldn't start payment — try again.", "error");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="px-5 pt-6 pb-10">
      {justConfirmed ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DURATION.fast }}
          className="flex flex-col items-center text-center mb-6"
        >
          <div className="relative w-20 h-20 mb-4 flex items-center justify-center">
            {/* The ripple — a soft ring expanding outward and fading,
                timed just behind the checkmark so it reads as an echo of
                confirmation rather than its own separate effect. */}
            <motion.div
              initial={{ scale: 0.6, opacity: 0.5 }}
              animate={{ scale: 1.8, opacity: 0 }}
              transition={{ duration: 0.9, ease: EASE, delay: 0.15 }}
              className="absolute inset-0 rounded-full"
              style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
            />
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={SPRING_SOFT}
              className="relative w-20 h-20 rounded-full flex items-center justify-center shadow-lg shadow-[#7C3AED]/30"
              style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
            >
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
                <motion.path
                  d="M4 12.5L9.5 18L20 6"
                  stroke="white"
                  strokeWidth={2.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.4, ease: EASE, delay: 0.25 }}
                />
              </svg>
            </motion.div>
          </div>
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.base, ease: EASE, delay: 0.45 }}
            className="text-[20px] font-bold text-[#1E1B4B] mb-1"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            Payment confirmed
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.base, ease: EASE, delay: 0.52 }}
            className="text-[12.5px] text-[#6B6483]"
          >
            Held safely by FindIt until you confirm delivery.
          </motion.p>
        </motion.div>
      ) : (
        <div className="flex items-center gap-2 mb-5">
          {alreadyPaid ? (
            <CheckCircle2 className="text-[#7C3AED]" size={22} />
          ) : (
            <CreditCard className="text-[#7C3AED]" size={22} />
          )}
          <h1 className="text-[19px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>
            {alreadyPaid ? "Payment held — order placed" : "Pay to place your order"}
          </h1>
        </div>
      )}

      <motion.div
        // Keyed on the confirmation moment: this card is already mounted
        // and visible before payment (nothing to key off yet), so a fresh
        // key here forces exactly one clean remount right as justConfirmed
        // flips true, letting `initial` actually take effect for the
        // "order details settle into place" beat instead of being a no-op
        // on an element that never unmounted.
        key={justConfirmed ? "confirmed" : "idle"}
        initial={justConfirmed ? { opacity: 0, y: 10 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.base, ease: EASE, delay: justConfirmed ? 0.6 : 0 }}
        className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 mb-5 shadow-sm shadow-[#4C1D95]/5"
      >
        <p className="text-[12px] text-[#6B6483] mb-1">{product.name} · Qty {qty}</p>
        <p className="text-[15px] font-semibold text-[#1E1B4B] mb-1">{product.seller}</p>
        <p className="text-[18px] font-bold text-[#7C3AED]">{naira(total)}</p>
      </motion.div>

      {!alreadyPaid && !notConfigured && (
        <>
          <div className="bg-[#F5F2FC] rounded-[20px] p-4 mb-5 flex items-start gap-2.5">
            <ShieldCheck size={16} className="text-[#7C3AED] mt-0.5 shrink-0" />
            <p className="text-[12px] text-[#514B67]">
              FindIt holds your payment until you confirm delivery — the seller is only paid out once you do. Nothing is charged until you complete checkout below.
            </p>
          </div>
          <motion.button
            onClick={pay}
            disabled={paying}
            {...press}
            className="w-full text-white text-[14px] font-semibold py-3.5 rounded-xl mb-6 disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
          >
            {paying ? "Starting checkout…" : `Pay ${naira(total)}`}
          </motion.button>
        </>
      )}

      {notConfigured && (
        <div className="bg-[#FDF6EC] border border-[#F5D9A8] rounded-[20px] p-4 mb-6">
          <p className="text-[12px] text-[#514B67]">
            Online payment isn't set up on FindIt yet. Message {product.seller} directly to arrange payment — your order is saved as "Awaiting payment" under My orders either way.
          </p>
        </div>
      )}

      {alreadyPaid && (
        <div key={justConfirmed ? "confirmed" : "idle"}>
          <p className="text-[12px] font-medium text-[#514B67] mb-3 uppercase tracking-wide">Delivery status</p>
          <div className="space-y-0 mb-6">
            {STEPS.map((s, i) => (
              <motion.div
                key={s}
                initial={justConfirmed ? { opacity: 0, y: 10 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: DURATION.base, ease: EASE, delay: justConfirmed ? 0.7 + i * 0.07 : 0 }}
                className="flex gap-3"
              >
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full ${i <= activeIdx ? "bg-[#7C3AED]" : "bg-[#E4DFF5]"}`} />
                  {i < STEPS.length - 1 && (
                    <div className={`w-0.5 flex-1 ${i < activeIdx ? "bg-[#7C3AED]" : "bg-[#E4DFF5]"}`} style={{ minHeight: 28 }} />
                  )}
                </div>
                <p className={`text-[13px] pb-6 ${i <= activeIdx ? "text-[#1E1B4B] font-medium" : "text-[#8A8372]"}`}>{s}</p>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <motion.button onClick={() => go("account")} {...press} className="flex-1 text-white text-[13px] font-semibold py-3 rounded-xl" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}>
          Track in My orders
        </motion.button>
        <motion.button onClick={() => go("home")} {...press} className="px-5 text-[13px] font-semibold text-[#6B6483] border border-[#ECE9F7] rounded-xl">
          Home
        </motion.button>
      </div>
    </div>
  );
}
