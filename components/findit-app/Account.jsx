"use client";

import { useState } from "react";
import { Heart, Star as StarFilled } from "lucide-react";
import { GROUPS, MY_SAVED_IDS, naira } from "./data";
import { Pill, ArtBlock } from "./shared";

export default function Account({ openProduct, orders, products, onReview }) {
  const [reviewing, setReviewing] = useState(null); // order id currently being reviewed
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const saved = products.filter((p) => MY_SAVED_IDS.includes(p.id));

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

  const statusTone = (s) => (s === "Delivered" ? "green" : s === "Awaiting payment" ? "stone" : "gold");

  return (
    <div className="px-5 pt-6 pb-10">
      <h1 className="text-[19px] font-bold text-[#1E1B4B] mb-1" style={{ fontFamily: "Fraunces, serif" }}>My orders</h1>
      <p className="text-[12px] text-[#6B6483] mb-5">Track deliveries, view history, and leave a review once an order arrives.</p>

      <div className="space-y-3 mb-8">
        {orders.map((o) => (
          <div key={o.id} className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 shadow-sm shadow-[#4C1D95]/5">
            <div className="flex items-start justify-between mb-1">
              <div>
                <p className="text-[12px] text-[#8A8372] font-mono">{o.id}</p>
                <p className="text-[13px] font-semibold text-[#1E1B4B]">{o.item}</p>
                <p className="text-[11px] text-[#6B6483]">{o.seller} · {o.date}</p>
              </div>
              <Pill tone={statusTone(o.status)}>{o.status}</Pill>
            </div>
            <p className="text-[14px] font-bold text-[#7C3AED] mt-2 mb-2">{naira(o.price)}</p>

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
              <ArtBlock icon={GROUPS[p.category].icon} art={p.art} className="h-28 w-full" />
              <span className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                <Heart size={14} className="fill-[#E64980] text-[#E64980]" />
              </span>
            </div>
            <p className="text-[12px] font-medium text-[#1E1B4B] leading-tight line-clamp-1 mb-0.5">{p.name}</p>
            <p className="text-[13px] font-bold text-[#1E1B4B]">{naira(p.price)}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
