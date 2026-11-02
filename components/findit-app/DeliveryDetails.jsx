"use client";

import { MapPin, Phone, Copy, Store, Truck, ExternalLink, CheckCircle2, Clock } from "lucide-react";
import { addressLines } from "@/lib/deliveryShared";
import { etaText } from "@/lib/shipping/engine";

// How an order gets to the buyer, on an order card: the delivery option and
// estimate chosen at checkout, the address (for the seller: with Call and
// Copy, and only once the order is paid; the server leaves it out before
// then), the tracking history once it's sent, or the pickup location and
// whether it's ready to collect.

const STATUS_LABELS = {
  pending: "Preparing",
  in_transit: "On its way",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  failed: "Delivery attempt failed",
  returned: "Returned to the seller",
  cancelled: "Cancelled",
};

const box = "bg-[#F7F5FD] border border-[#E7E3F4] rounded-xl px-3 py-2.5 mb-2.5";
const when = (iso) => new Date(iso).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function Tracking({ shipment, showToast }) {
  if (!shipment) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shipment.trackingNumber);
      showToast?.("Tracking number copied.");
    } catch {
      // nothing to do
    }
  };
  return (
    <div className={box}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#7C3AED] uppercase tracking-wide mb-1">
        <Truck size={12} /> {STATUS_LABELS[shipment.status] ?? shipment.status}
      </p>
      <p className="text-[12px] text-[#1E1B4B]">
        {shipment.carrier}
        {shipment.trackingNumber && (
          <>
            {" · "}
            <button type="button" onClick={copy} className="font-mono text-[11.5px] text-[#514B67] underline decoration-dotted">
              {shipment.trackingNumber}
            </button>
          </>
        )}
      </p>
      {shipment.trackingUrl && (
        <a href={shipment.trackingUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#7C3AED] mt-1">
          Track parcel <ExternalLink size={11} />
        </a>
      )}
      {shipment.events?.length > 0 && (
        <ol className="mt-2 space-y-1 border-l border-[#DDD6F3] pl-3">
          {shipment.events.map((e, i) => (
            <li key={i} className="text-[11px] text-[#514B67]">
              <span className="font-semibold text-[#1E1B4B]">{STATUS_LABELS[e.status] ?? e.status}</span>
              {e.description ? ` · ${e.description}` : ""} <span className="text-[#8A8372]">· {when(e.occurredAt)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function DeliveryDetails({ order, forSeller = false, showToast }) {
  if (!order.deliveryMethod) return null;

  if (order.deliveryMethod === "pickup") {
    const l = order.pickupLocation;
    const status = order.pickupStatus;
    return (
      <div className={box}>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#7C3AED] uppercase tracking-wide mb-1">
          <Store size={12} />
          {status === "collected" ? "Collected" : status === "ready" ? "Ready to collect" : forSeller ? "Buyer will collect" : "Pickup"}
        </p>
        {l ? (
          <>
            <p className="text-[12.5px] font-semibold text-[#1E1B4B]">{l.name}</p>
            <p className="text-[12px] text-[#514B67]">{l.address}, {l.area}, {l.state}</p>
            {l.hours && <p className="text-[11.5px] text-[#6B6483]">Open {l.hours}</p>}
            {l.instructions && <p className="text-[11.5px] text-[#6B6483]">{l.instructions}</p>}
          </>
        ) : (
          <p className="text-[11.5px] text-[#514B67]">
            {forSeller ? "Message the buyer to agree a time and place." : "Message the seller to agree a time and place."}
          </p>
        )}
        {status === "awaiting" && !forSeller && order.paymentStatus === "paid" && (
          <p className="flex items-center gap-1 text-[11px] text-[#6B6483] mt-1"><Clock size={11} /> You'll be told when it's ready to collect.</p>
        )}
      </div>
    );
  }

  const opt = order.shippingOption;
  const eta = opt ? etaText(opt) : null;
  const optionLine = opt ? (
    <p className="text-[11.5px] text-[#514B67] mb-1">
      {opt.name}
      {eta ? ` · ${eta}` : ""}
      {opt.source === "carrier" ? " · carrier rate" : eta ? " (seller's estimate)" : ""}
    </p>
  ) : null;

  const a = order.deliveryAddress;
  if (!a) {
    return (
      <div className={box}>
        {optionLine}
        <p className="flex items-start gap-2 text-[11.5px] text-[#514B67]">
          <MapPin size={14} className="text-[#7C3AED] mt-0.5 shrink-0" />
          The buyer chose delivery. You'll see the address once they've paid.
        </p>
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
    <>
      <div className={box}>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#7C3AED] uppercase tracking-wide mb-1">
          <MapPin size={12} /> {forSeller ? "Deliver to" : "Delivering to"}
        </p>
        {optionLine}
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
      <Tracking shipment={order.shipment} showToast={showToast} />
      {order.shipment?.status === "delivered" && !forSeller && (
        <p className="flex items-center gap-1 text-[11px] text-[#15803D] mb-2.5"><CheckCircle2 size={11} /> Delivered</p>
      )}
    </>
  );
}
