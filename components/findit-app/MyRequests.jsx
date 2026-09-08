"use client";

import { useState } from "react";
import { ListOrdered, Star, BadgeCheck, Clock } from "lucide-react";
import { naira, GROUPS } from "./data";
import { Pill } from "./shared";

function budgetLabel(r) {
  if (!r.budgetMin && !r.budgetMax) return "Open budget";
  if (r.budgetMin && r.budgetMax && r.budgetMin !== r.budgetMax) {
    return `${naira(r.budgetMin)}–${naira(r.budgetMax).replace("₦", "")}`;
  }
  return naira(r.budgetMax || r.budgetMin);
}

function statusTone(status) {
  if (status === "matched") return "green";
  if (status === "cancelled") return "stone";
  return "gold";
}

export default function MyRequests({ requests, onAcceptOffer }) {
  const [acceptingId, setAcceptingId] = useState(null);

  const accept = async (requestId, offerId) => {
    setAcceptingId(offerId);
    try {
      await onAcceptOffer(requestId, offerId);
    } finally {
      setAcceptingId(null);
    }
  };

  return (
    <div className="px-5 pt-6 pb-10">
      <div className="flex items-center gap-2 mb-1">
        <ListOrdered size={17} className="text-[#7C3AED]" />
        <h1 className="text-[19px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>My requests</h1>
      </div>
      <p className="text-[12px] text-[#6B6483] mb-5">Real sellers respond here — accept an offer whenever one looks right.</p>

      {requests.length === 0 && (
        <p className="text-[12px] text-[#6B6483]">
          No requests yet — tap "Request" to ask FindIt for something you can't find.
        </p>
      )}

      <div className="space-y-4">
        {requests.map((r) => (
          <div key={r.id} className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 shadow-sm shadow-[#4C1D95]/5">
            <div className="flex items-start justify-between mb-1">
              <p className="text-[14px] font-semibold text-[#1E1B4B] pr-2">{r.title}</p>
              <Pill tone={statusTone(r.status)}>{r.status === "matched" ? "Matched" : r.status === "cancelled" ? "Cancelled" : "Open"}</Pill>
            </div>
            <p className="text-[11px] text-[#8A8372] flex items-center gap-1 mb-3">
              <Clock size={10} /> {r.posted} · {budgetLabel(r)}{r.category && GROUPS[r.category] ? ` · ${GROUPS[r.category].label}` : ""}
            </p>

            {r.offers.length === 0 ? (
              <p className="text-[12px] text-[#6B6483]">No offers yet — check back soon.</p>
            ) : (
              <div className="space-y-2.5">
                {r.offers.map((o) => (
                  <div key={o.id} className="bg-[#F5F2FC] rounded-xl p-3">
                    <div className="flex items-start justify-between mb-1.5">
                      <div>
                        <p className="text-[13px] font-semibold text-[#1E1B4B] flex items-center gap-1">
                          {o.seller} {o.verified && <BadgeCheck size={12} className="text-[#7C3AED]" />}
                        </p>
                        {o.rating != null && (
                          <span className="flex items-center gap-0.5 text-[10.5px] text-[#6B6483]">
                            <Star size={9} className="fill-[#F59E0B] text-[#F59E0B]" /> {o.rating}
                          </span>
                        )}
                      </div>
                      <p className="text-[15px] font-bold text-[#7C3AED]">{naira(o.price)}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-y-1 text-[11px] text-[#514B67] mb-2">
                      <span>Condition: {o.condition}</span>
                      <span>Delivery: {o.delivery === "Pickup only" ? o.delivery : `₦${o.delivery}`}</span>
                      <span>ETA: {o.eta}</span>
                      <span>Warranty: {o.warranty}</span>
                    </div>
                    {o.note && <p className="text-[11px] text-[#6B6483] italic mb-2">"{o.note}"</p>}
                    {o.accepted ? (
                      <Pill tone="green">Accepted</Pill>
                    ) : r.status === "matched" ? (
                      <p className="text-[11px] text-[#8A8372]">Another offer was accepted for this request.</p>
                    ) : (
                      <button
                        onClick={() => accept(r.id, o.id)}
                        disabled={acceptingId !== null}
                        className={`w-full text-white text-[12px] font-semibold py-2 rounded-lg ${acceptingId !== null ? "opacity-60" : ""}`}
                        style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
                      >
                        {acceptingId === o.id ? "Placing order…" : "Accept offer & pay"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
