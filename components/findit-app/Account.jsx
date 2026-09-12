"use client";

import { useState } from "react";
import { Heart, Star as StarFilled, ShieldCheck, PackageCheck, AlertTriangle, CreditCard } from "lucide-react";
import { GROUPS, naira } from "./data";
import { Pill, ArtBlock } from "./shared";

export default function Account({ openProduct, orders, products, onReview, onConfirmDelivery, onReportIssue, onPayOrder, savedIds, showToast }) {
  const [reviewing, setReviewing] = useState(null); // order id currently being reviewed
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(null); // order id being confirmed
  const [reporting, setReporting] = useState(null);   // order id being reported
  const [issueNote, setIssueNote] = useState("");
  const [paying, setPaying] = useState(null); // order id being paid
  const saved = products.filter((p) => savedIds.includes(p.id));

  const pay = async (orderId) => {
    setPaying(orderId);
    try {
      const result = await onPayOrder(orderId);
      if (result.configured === false) {
        showToast?.(result.message || "Payments aren't set up yet — contact the seller directly.", "error");
      } else if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      }
    } catch (err) {
      showToast?.(err.message || "Couldn't start payment — try again.", "error");
    } finally {
      setPaying(null);
    }
  };

  const submitReview = async (orderId) => {
    setSubmitting(true);
    try {
      await onReview(orderId, rating, comment);
      setReviewing(null);
      setComment("");
      setRating(5);
    } catch {
      // MainApp already surfaced a toast; keep the form open so they can retry
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelivery = async (orderId) => {
    setConfirming(orderId);
    try {
      await onConfirmDelivery(orderId);
    } catch {
      // MainApp surfaced a toast already
    } finally {
      setConfirming(null);
    }
  };

  const submitIssue = async (orderId) => {
    setSubmitting(true);
    try {
      await onReportIssue(orderId, issueNote);
      setReporting(null);
      setIssueNote("");
    } catch {
      // Keep the form open so they can adjust and retry
    } finally {
      setSubmitting(false);
    }
  };

  const statusTone = (s) => (s === "Delivered" ? "green" : s === "Awaiting payment" ? "stone" : "gold");

  // Where the buyer's money stands, in their words rather than ours.
  const ESCROW_COPY = {
    unpaid: { icon: CreditCard, tone: "text-[#8A8372]", text: "Awaiting your payment" },
    held: { icon: ShieldCheck, tone: "text-[#7C3AED]", text: "Payment held by FindIt" },
    released: { icon: ShieldCheck, tone: "text-[#16A34A]", text: "Payment released to the seller" },
    disputed: { icon: AlertTriangle, tone: "text-[#D97706]", text: "Problem reported — FindIt is reviewing it" },
    refunded: { icon: ShieldCheck, tone: "text-[#16A34A]", text: "Refunded to you" },
  };

  // The seller has handed it over, so the buyer can now say whether it arrived.
  const awaitingConfirmation = (o) =>
    !o.buyerConfirmedAt &&
    o.escrowStatus !== "refunded" &&
    (o.status === "Dispatched" || o.status === "Out for delivery");

  return (
    <div className="px-5 pt-6 pb-10">
      <h1 className="text-[19px] font-bold text-[#1E1B4B] mb-1" style={{ fontFamily: "Fraunces, serif" }}>My orders</h1>
      <p className="text-[12px] text-[#6B6483] mb-5">Track deliveries, view history, and leave a review once an order arrives.</p>

      <div className="space-y-3 mb-8">
        {orders.length === 0 && (
          <p className="text-[12px] text-[#6B6483]">No orders yet — browse the catalogue or request an item to get started.</p>
        )}
        {orders.map((o) => (
          <div key={o.id} className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 shadow-sm shadow-[#4C1D95]/5">
            <div className="flex items-start justify-between mb-1">
              <div>
                <p className="text-[12px] text-[#8A8372] font-mono">{o.id}</p>
                <p className="text-[13px] font-semibold text-[#1E1B4B]">{o.item}</p>
                <p className="text-[11px] text-[#6B6483]">{o.seller} · {new Date(o.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</p>
              </div>
              <Pill tone={statusTone(o.status)}>{o.status}</Pill>
            </div>
            <p className="text-[14px] font-bold text-[#7C3AED] mt-2 mb-2">{naira(o.price)}</p>

            {/* Where the money stands — the app promises this on every product
                page and at checkout, so it has to be visible on the order too. */}
            {(() => {
              const escrow = ESCROW_COPY[o.escrowStatus] ?? ESCROW_COPY.held;
              const EscrowIcon = escrow.icon;
              return (
                <div className={`flex items-center gap-1.5 text-[11px] mb-2.5 ${escrow.tone}`}>
                  <EscrowIcon size={13} className="shrink-0" />
                  <span>{escrow.text}</span>
                </div>
              );
            })()}

            {/* An order created straight from "Buy now" already went through
                Checkout's own "Pay now" — this covers the other path, an
                accepted request offer, which lands here still unpaid with
                no other screen that offers to pay it. */}
            {o.paymentStatus !== "paid" && (
              <button
                onClick={() => pay(o.id)}
                disabled={paying === o.id}
                className="w-full flex items-center justify-center gap-1.5 text-white text-[12.5px] font-semibold py-2.5 rounded-xl mb-2.5 disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
              >
                <CreditCard size={14} />
                {paying === o.id ? "Starting checkout…" : `Pay ${naira(o.price)}`}
              </button>
            )}

            {/* Only the buyer can end an order. Until they tap this, the money
                stays with FindIt no matter what the seller marked. */}
            {awaitingConfirmation(o) && reporting !== o.id && (
              <div className="mb-2">
                <p className="text-[11px] text-[#6B6483] mb-2">
                  {o.escrowStatus === "disputed"
                    ? "We're reviewing your report. If it turns out fine, you can still confirm you received it."
                    : "Has it arrived? Your payment only reaches the seller once you confirm."}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => confirmDelivery(o.id)}
                    disabled={confirming === o.id}
                    className={`flex-1 flex items-center justify-center gap-1.5 text-white text-[12px] font-semibold py-2.5 rounded-xl ${confirming === o.id ? "opacity-60" : ""}`}
                    style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
                  >
                    <PackageCheck size={14} />
                    {confirming === o.id ? "Confirming…" : "I received this"}
                  </button>
                  {o.escrowStatus !== "disputed" && (
                    <button
                      onClick={() => { setReporting(o.id); setIssueNote(""); }}
                      className="px-4 text-[12px] font-semibold text-[#6B6483] border border-[#ECE9F7] rounded-xl"
                    >
                      Report a problem
                    </button>
                  )}
                </div>
              </div>
            )}

            {reporting === o.id && (
              <div className="mt-2 pt-3 border-t border-[#ECE9F7]">
                <p className="text-[11px] text-[#6B6483] mb-2">
                  What went wrong? FindIt keeps holding your payment while we look into it.
                </p>
                <textarea
                  value={issueNote}
                  onChange={(e) => setIssueNote(e.target.value)}
                  rows={3}
                  placeholder="e.g. It never arrived, or it isn't what was described"
                  className="w-full border border-[#ECE9F7] rounded-xl px-3 py-2 text-[12px] outline-none resize-none mb-3"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => submitIssue(o.id)}
                    disabled={submitting || issueNote.trim().length < 5}
                    className={`flex-1 flex items-center justify-center gap-1.5 text-white text-[12px] font-semibold py-2.5 rounded-xl ${submitting || issueNote.trim().length < 5 ? "opacity-40" : ""}`}
                    style={{ background: "linear-gradient(135deg,#F59E0B,#D97706)" }}
                  >
                    <AlertTriangle size={14} />
                    {submitting ? "Sending…" : "Report problem"}
                  </button>
                  <button
                    onClick={() => setReporting(null)}
                    disabled={submitting}
                    className={`px-4 text-[12px] font-semibold text-[#6B6483] border border-[#ECE9F7] rounded-xl ${submitting ? "opacity-60" : ""}`}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {o.reviewed && (
              <div className="flex items-center gap-1 text-[12px] text-[#6B6483]">
                <span className="flex">
                  {[1, 2, 3, 4, 5].map((n) => <StarFilled key={n} size={12} className={n <= o.myRating ? "fill-[#F59E0B] text-[#F59E0B]" : "text-[#E4DFF5]"} />)}
                </span>
                You reviewed this order
              </div>
            )}

            {o.canReview && !o.reviewed && reviewing !== o.id && (
              <button onClick={() => { setReviewing(o.id); setRating(5); }} className="text-[12px] font-semibold px-3.5 py-2 rounded-full text-white" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}>
                Leave a review
              </button>
            )}

            {reviewing === o.id && (
              <div className="mt-2 pt-3 border-t border-[#ECE9F7]">
                <p className="text-[11px] text-[#6B6483] mb-2">Rate {o.seller}</p>
                <div className="flex gap-1 mb-3">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setRating(n)}>
                      <StarFilled size={22} className={n <= rating ? "fill-[#F59E0B] text-[#F59E0B]" : "text-[#E4DFF5]"} />
                    </button>
                  ))}
                </div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                  placeholder="Optional — how was the product and delivery?"
                  className="w-full border border-[#ECE9F7] rounded-xl px-3 py-2 text-[12px] outline-none resize-none mb-3"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => submitReview(o.id)}
                    disabled={submitting}
                    className={`flex-1 text-white text-[12px] font-semibold py-2.5 rounded-xl ${submitting ? "opacity-60" : ""}`}
                    style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
                  >
                    {submitting ? "Submitting…" : "Submit review"}
                  </button>
                  <button onClick={() => setReviewing(null)} disabled={submitting} className={`px-4 text-[12px] font-semibold text-[#6B6483] border border-[#ECE9F7] rounded-xl ${submitting ? "opacity-60" : ""}`}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <h2 className="text-[15px] font-bold text-[#1E1B4B] mb-3">Saved items</h2>
      <div className="grid grid-cols-2 gap-x-3 gap-y-5">
        {saved.map((p) => (
          <button key={p.id} onClick={() => openProduct(p)} className="text-left">
            <div className="relative rounded-[20px] overflow-hidden mb-2">
              <ArtBlock icon={GROUPS[p.category].icon} art={p.art} imageUrl={p.imageUrl} className="h-28 w-full" />
              <span className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                <Heart size={14} className="fill-[#E64980] text-[#E64980]" />
              </span>
            </div>
            <p className="text-[12px] font-medium text-[#1E1B4B] leading-tight line-clamp-1 mb-0.5">{p.name}</p>
            <p className="text-[13px] font-bold text-[#1E1B4B]">{naira(p.price)}</p>
          </button>
        ))}
        {saved.length === 0 && (
          <p className="col-span-2 text-[12px] text-[#6B6483]">Nothing saved yet — tap the heart on a product to save it here.</p>
        )}
      </div>
    </div>
  );
}
