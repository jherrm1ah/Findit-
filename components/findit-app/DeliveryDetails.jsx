"use client";

import { MapPin, Phone, Copy, Store } from "lucide-react";
import { addressLines } from "@/lib/deliveryShared";

// How an order gets to the buyer, on an order card. For the seller
// (forSeller) it's what they need to fulfil it: where to deliver, with a
// button to call the receiver and one to copy the address for a rider. The
// address only reaches a seller once the order is paid (the server leaves it
// out before then), so an unpaid order just says what the buyer chose.
export default function DeliveryDetails({ order, forSeller = false, showToast }) {
  if (!order.deliveryMethod) return null;

  if (order.deliveryMethod === "pickup") {
    return (
      <div className="flex items-start gap-2 bg-[#F7F5FD] rounded-xl px-3 py-2.5 mb-2.5">
        <Store size={14} className="text-[#7C3AED] mt-0.5 shrink-0" />
        <p className="text-[11.5px] text-[#514B67]">
          {forSeller
            ? "The buyer will pick this up. Message them to agree a time and place."
            : "You're picking this up. Message the seller to agree a time and place."}
        </p>
      </div>
    );
  }

  const a = order.deliveryAddress;
  if (!a) {
    return (
      <div className="flex items-start gap-2 bg-[#F7F5FD] rounded-xl px-3 py-2.5 mb-2.5">
        <MapPin size={14} className="text-[#7C3AED] mt-0.5 shrink-0" />
        <p className="text-[11.5px] text-[#514B67]">The buyer chose delivery. You'll see the address once they've paid.</p>
      </div>
    );
  }

  const lines = addressLines(a);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      showToast?.("Address copied.");
    } catch {
      showToast?.("Couldn't copy. Long-press the address to copy it.", "error");
    }
  };

  return (
    <div className="bg-[#F7F5FD] border border-[#E7E3F4] rounded-xl px-3 py-2.5 mb-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#7C3AED] uppercase tracking-wide mb-1">
        <MapPin size={12} /> {forSeller ? "Deliver to" : "Delivering to"}
      </p>
      <p className="text-[12.5px] font-semibold text-[#1E1B4B]">{a.fullName}</p>
      <p className="text-[12px] text-[#514B67] select-text">{a.address}</p>
      <p className="text-[12px] text-[#514B67] select-text">{[a.area, a.state].filter(Boolean).join(", ")}</p>
      {a.landmark && <p className="text-[11.5px] text-[#6B6483]">Landmark: {a.landmark}</p>}
      <p className="text-[12px] text-[#514B67]">{a.phone}</p>
      {forSeller && (
        <div className="flex items-center gap-4 mt-2">
          <a href={`tel:${a.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-1 text-[11.5px] font-semibold text-[#7C3AED]">
            <Phone size={12} /> Call
          </a>
          <button type="button" onClick={copy} className="flex items-center gap-1 text-[11.5px] font-semibold text-[#7C3AED]">
            <Copy size={12} /> Copy address
          </button>
        </div>
      )}
    </div>
  );
}
