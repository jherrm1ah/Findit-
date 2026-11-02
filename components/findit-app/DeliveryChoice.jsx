"use client";

import { motion } from "motion/react";
import { Truck, Store, Lock } from "lucide-react";
import { NIGERIAN_STATES, deliveryChoices } from "@/lib/deliveryShared";
import { etaText } from "@/lib/shipping/engine";
import { naira } from "./data";
import { SPRING_BOUNCY } from "./motion";

// The "How do you want it?" step of checkout: delivered to an address (the
// seller's delivery fee is added) or picked up from the seller. Only offers
// what the seller offers for this order. The address form is filled in from
// the buyer's last checkout, or their name and phone the first time.
//
// The server works the price out itself from the order (see
// lib/repo.ts#setOrderDelivery); nothing here is trusted as an amount.

const inputCls =
  "w-full bg-white border border-[#ECE9F7] rounded-xl px-3 py-2.5 text-[13px] text-[#1E1B4B] outline-none focus:border-[#A78BFA]";

export const EMPTY_ADDRESS = { fullName: "", phone: "", address: "", area: "", state: "", landmark: "" };

// Where the form starts: this order's own address, else the last one used,
// else just the buyer's name and phone.
export function startingAddress(order, user) {
  const from = order?.deliveryAddress || user?.savedDeliveryAddress;
  if (from) return { ...EMPTY_ADDRESS, ...from, landmark: from.landmark || "" };
  return { ...EMPTY_ADDRESS, fullName: user?.name || "", phone: user?.phone || "" };
}

// The first thing missing, in the buyer's words, or null when it's complete.
// The server checks the same things; this just saves a round trip.
export function missingAddressField(a) {
  if ((a.fullName || "").trim().length < 2) return "Add the name of the person receiving the order.";
  const digits = (a.phone || "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 14) return "Add a phone number the rider can call.";
  if ((a.address || "").trim().length < 5) return "Add the house number and street.";
  if ((a.area || "").trim().length < 2) return "Add the area or city.";
  if (!a.state) return "Choose a state.";
  return null;
}

function Option({ selected, disabled, onClick, icon: Icon, title, detail }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={SPRING_BOUNCY}
      aria-pressed={selected}
      className={`flex-1 text-left rounded-2xl p-3.5 border transition-colors ${
        selected ? "border-[#7C3AED] bg-[#F5F2FC]" : "border-[#ECE9F7] bg-white"
      } ${disabled && !selected ? "opacity-50" : ""}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <div
          className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${
            selected ? "border-[#7C3AED]" : "border-[#B7AFD6]"
          }`}
        >
          {selected && <div className="w-2 h-2 rounded-full bg-[#7C3AED]" />}
        </div>
        <Icon size={15} className="text-[#7C3AED] shrink-0" />
        <p className="text-[13px] font-semibold text-[#1E1B4B]">{title}</p>
      </div>
      <p className="text-[11.5px] text-[#6B6483] pl-6">{detail}</p>
    </motion.button>
  );
}

// One delivery option from the seller's rates (lib/shipping): name, when it
// arrives, the fee. Marked as the seller's own estimate; a live carrier
// quote (none connected yet) would say so instead.
function OptionRow({ option, selected, onSelect }) {
  const eta = etaText(option);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full flex items-start gap-2.5 text-left rounded-xl p-3 border ${selected ? "border-[#7C3AED] bg-[#F5F2FC]" : "border-[#ECE9F7] bg-white"}`}
    >
      <div className={`mt-0.5 w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${selected ? "border-[#7C3AED]" : "border-[#B7AFD6]"}`}>
        {selected && <div className="w-2 h-2 rounded-full bg-[#7C3AED]" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-semibold text-[#1E1B4B]">{option.name}</p>
        <p className="text-[11px] text-[#6B6483]">
          {[eta, option.source === "carrier" ? "Live carrier rate" : "Estimate set by the seller"].filter(Boolean).join(" · ")}
        </p>
        {option.freeOver && <p className="text-[11px] text-[#15803D]">Free on orders from {naira(option.freeOver)}</p>}
      </div>
      <p className="text-[12.5px] font-semibold text-[#1E1B4B] shrink-0">
        {option.fee > 0 ? naira(option.fee) : option.unset ? "Not set" : "Free"}
      </p>
    </button>
  );
}

export default function DeliveryChoice({
  order, method, setMethod, address, setAddress, pickupFrom,
  shipping = { loading: false, quote: null, pickupLocations: [] }, optionId, setOptionId, pickupId, setPickupId,
}) {
  const choices = deliveryChoices(order.deliveryOptions);
  const quote = shipping.quote;
  const cheapest = quote?.ok ? quote.options[0] : null;
  const pickups = shipping.pickupLocations || [];
  const locked = order.deliveryLocked;
  const set = (key) => (e) => setAddress({ ...address, [key]: e.target.value });

  return (
    <div className="mb-5">
      <p className="text-[12px] font-medium text-[#514B67] mb-2.5 uppercase tracking-wide">How do you want it?</p>
      <div className="flex gap-2.5 mb-3">
        {choices.delivery && (
          <Option
            selected={method === "delivery"}
            disabled={locked && method !== "delivery"}
            onClick={() => setMethod("delivery")}
            icon={Truck}
            title="Deliver to me"
            detail={
              !address.state || method !== "delivery"
                ? "Options for your address"
                : quote && !quote.ok
                  ? "Not available to this address"
                  : cheapest
                    ? cheapest.fee > 0
                      ? `From ${naira(cheapest.fee)}`
                      : cheapest.unset
                        ? "Seller hasn't set a delivery fee"
                        : "Free delivery"
                    : "Checking…"
            }
          />
        )}
        {choices.pickup && (
          <Option
            selected={method === "pickup"}
            disabled={locked && method !== "pickup"}
            onClick={() => setMethod("pickup")}
            icon={Store}
            title="I'll pick it up"
            detail={
              pickups.length > 1 ? `Free, at ${pickups.length} locations` : pickups.length === 1 ? `Free, at ${pickups[0].area}` : pickupFrom ? `From ${pickupFrom}` : "From the seller, no delivery fee"
            }
          />
        )}
      </div>

      {locked && (
        <p className="flex items-center gap-1.5 text-[11.5px] text-[#6B6483] mb-3">
          <Lock size={12} className="shrink-0" />
          You started paying with this choice, so it can't change now. You can still fix the address.
        </p>
      )}

      {method === "pickup" && pickups.length === 0 && (
        <p className="text-[12px] text-[#514B67] bg-[#F7F5FD] rounded-xl px-3 py-2.5">
          Once you've paid, message the seller to agree a time and place to collect it.
        </p>
      )}
      {method === "pickup" && pickups.length > 0 && (
        <div className="space-y-2">
          <p className="text-[12px] font-semibold text-[#1E1B4B]">Where you'll collect it</p>
          {pickups.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setPickupId?.(l.id)}
              aria-pressed={pickupId === l.id}
              className={`w-full text-left rounded-xl p-3 border ${pickupId === l.id ? "border-[#7C3AED] bg-[#F5F2FC]" : "border-[#ECE9F7] bg-white"}`}
            >
              <p className="text-[12.5px] font-semibold text-[#1E1B4B]">{l.name}</p>
              <p className="text-[11.5px] text-[#514B67]">{l.address}, {l.area}, {l.state}</p>
              {l.hours && <p className="text-[11px] text-[#6B6483]">Open {l.hours}</p>}
              {l.instructions && <p className="text-[11px] text-[#6B6483]">{l.instructions}</p>}
            </button>
          ))}
          <p className="text-[11px] text-[#8A8372]">No delivery fee. The seller tells you when it's ready to collect.</p>
        </div>
      )}

      {method === "delivery" && (
        <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 space-y-2.5">
          <p className="text-[13px] font-semibold text-[#1E1B4B]">Delivery address</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] text-[#6B6483]">Receiver's name</span>
              <input value={address.fullName} onChange={set("fullName")} autoComplete="name" className={`mt-1 ${inputCls}`} />
            </label>
            <label className="block">
              <span className="text-[11px] text-[#6B6483]">Phone number</span>
              <input value={address.phone} onChange={set("phone")} type="tel" inputMode="tel" autoComplete="tel" className={`mt-1 ${inputCls}`} />
            </label>
          </div>
          <label className="block">
            <span className="text-[11px] text-[#6B6483]">House number and street</span>
            <input
              value={address.address}
              onChange={set("address")}
              autoComplete="street-address"
              placeholder="e.g. 12 Herbert Macaulay Way"
              className={`mt-1 ${inputCls}`}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] text-[#6B6483]">Area / city</span>
              <input value={address.area} onChange={set("area")} placeholder="e.g. Yaba" className={`mt-1 ${inputCls}`} />
            </label>
            <label className="block">
              <span className="text-[11px] text-[#6B6483]">State</span>
              <select value={address.state} onChange={set("state")} className={`mt-1 ${inputCls}`}>
                <option value="">Choose…</option>
                {NIGERIAN_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-[11px] text-[#6B6483]">Landmark (optional)</span>
            <input value={address.landmark} onChange={set("landmark")} placeholder="e.g. Opposite Shoprite, blue gate" className={`mt-1 ${inputCls}`} />
          </label>
          <p className="text-[11px] text-[#8A8372]">The seller only sees this once you've paid.</p>
        </div>
      )}

      {/* The seller's options for this address, priced by the server. */}
      {method === "delivery" && address.state && (
        <div className="mt-3 space-y-2">
          <p className="text-[12px] font-semibold text-[#1E1B4B]">Delivery options</p>
          {shipping.loading && !quote && <p className="text-[11.5px] text-[#6B6483]">Working out delivery to {address.area || address.state}…</p>}
          {quote && !quote.ok && (
            <p className="text-[12px] text-[#B45309] bg-[#FDF6EC] rounded-xl px-3 py-2.5">
              {quote.message} {choices.pickup ? "You can choose pickup instead, or message the seller." : "Message the seller to arrange it."}
            </p>
          )}
          {quote?.ok &&
            quote.options.map((o) => <OptionRow key={o.id} option={o} selected={optionId === o.id} onSelect={() => setOptionId?.(o.id)} />)}
        </div>
      )}
    </div>
  );
}
