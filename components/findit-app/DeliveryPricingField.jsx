"use client";

import { Plus, X, Gift, Truck, MapPin } from "lucide-react";
import { NIGERIAN_STATES } from "@/lib/deliveryShared";

// "How do you charge for delivery?" on the listing form, like a shop's
// shipping settings (lib/deliveryShared.ts#DeliveryPricing):
// - Free shipping: delivery is already included in the price.
// - Fixed fee: one delivery fee, shown to buyers on the product.
// - By location: a fee for each state the seller lists, and one for every
//   other state. Checkout charges by the buyer's address.
// The seller has to choose (nothing defaults to "free").

const box = "bg-white border border-[#ECE9F7] rounded-lg px-3 py-2 text-[12.5px] outline-none";
const input = `w-full ${box}`;

const CHOICES = [
  { key: "free", icon: Gift, title: "Free shipping", detail: "Delivery is included in your price" },
  { key: "fixed", icon: Truck, title: "Fixed fee", detail: "One delivery fee everywhere" },
  { key: "location", icon: MapPin, title: "By location", detail: "A different fee for each state" },
];

// The form's starting values for a listing (or a new one: nothing chosen).
export function pricingFormFrom(product) {
  return {
    deliveryPricing: product?.deliveryPricing ?? "",
    deliveryFee: product?.deliveryFee ? String(product.deliveryFee) : "",
    deliveryRates: Object.entries(product?.deliveryRates ?? {}).map(([state, fee]) => ({ state, fee: String(fee) })),
  };
}

const wholeNaira = (v) => v !== "" && Number.isInteger(Number(v)) && Number(v) >= 0;

// Whether the delivery part of the form is complete.
export function pricingFormValid(form) {
  if (form.deliveryOption === "Pickup") return true;
  if (form.deliveryPricing === "free") return true;
  if (form.deliveryPricing === "fixed") return wholeNaira(form.deliveryFee) && Number(form.deliveryFee) > 0;
  if (form.deliveryPricing === "location") {
    return (
      wholeNaira(form.deliveryFee) &&
      form.deliveryRates.length > 0 &&
      form.deliveryRates.every((r) => r.state && wholeNaira(r.fee))
    );
  }
  return false;
}

// What the listing API takes.
export function pricingPayload(form) {
  if (form.deliveryOption === "Pickup") return { deliveryPricing: null, deliveryFee: 0, deliveryRates: null };
  if (form.deliveryPricing === "free") return { deliveryPricing: "free", deliveryFee: 0, deliveryRates: null };
  if (form.deliveryPricing === "fixed") return { deliveryPricing: "fixed", deliveryFee: Number(form.deliveryFee), deliveryRates: null };
  return {
    deliveryPricing: "location",
    deliveryFee: Number(form.deliveryFee || 0),
    deliveryRates: Object.fromEntries(form.deliveryRates.map((r) => [r.state, Number(r.fee)])),
  };
}

export default function DeliveryPricingField({ form, setForm }) {
  const set = (patch) => setForm({ ...form, ...patch });
  const rates = form.deliveryRates;
  const used = new Set(rates.map((r) => r.state));
  const setRate = (i, patch) => set({ deliveryRates: rates.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  return (
    <div className="space-y-2.5">
      <p className="text-[11.5px] font-medium text-[#514B67]">How do you charge for delivery?</p>
      <div className="grid grid-cols-3 gap-2">
        {CHOICES.map(({ key, icon: Icon, title, detail }) => {
          const on = form.deliveryPricing === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() =>
                set({
                  deliveryPricing: key,
                  ...(key === "location" && rates.length === 0 ? { deliveryRates: [{ state: "", fee: "" }] } : {}),
                })
              }
              aria-pressed={on}
              className={`text-left rounded-xl p-2.5 border transition-colors ${on ? "border-[#7C3AED] bg-white" : "border-[#ECE9F7] bg-white/60"}`}
            >
              <Icon size={15} className="text-[#7C3AED] mb-1" />
              <p className={`text-[12px] leading-tight ${on ? "font-semibold text-[#1E1B4B]" : "text-[#1E1B4B]"}`}>{title}</p>
              <p className="text-[10.5px] text-[#6B6483] leading-snug mt-0.5">{detail}</p>
            </button>
          );
        })}
      </div>

      {form.deliveryPricing === "free" && (
        <p className="text-[11px] text-[#6B6483]">
          Buyers see &ldquo;Free delivery&rdquo;. Make sure your price covers what delivery costs you.
        </p>
      )}

      {form.deliveryPricing === "fixed" && (
        <label className="block">
          <span className="text-[11.5px] text-[#514B67]">Delivery fee (₦)</span>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={form.deliveryFee}
            onChange={(e) => set({ deliveryFee: e.target.value })}
            placeholder="e.g. 2500"
            className={`mt-1 ${input}`}
          />
        </label>
      )}

      {form.deliveryPricing === "location" && (
        <div className="space-y-2">
          {rates.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <select value={r.state} onChange={(e) => setRate(i, { state: e.target.value })} className={`flex-1 min-w-0 ${box}`} aria-label="State">
                <option value="">Choose a state…</option>
                {NIGERIAN_STATES.filter((s) => s === r.state || !used.has(s)).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={r.fee}
                onChange={(e) => setRate(i, { fee: e.target.value })}
                placeholder="₦ fee"
                aria-label={`Delivery fee to ${r.state || "this state"}`}
                className={`w-[96px] shrink-0 ${box}`}
              />
              <button
                type="button"
                onClick={() => set({ deliveryRates: rates.filter((_, j) => j !== i) })}
                aria-label="Remove this state"
                className="p-1.5 text-[#8A8372]"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => set({ deliveryRates: [...rates, { state: "", fee: "" }] })}
            className="flex items-center gap-1 text-[11.5px] font-semibold text-[#7C3AED]"
          >
            <Plus size={13} /> Add a state
          </button>
          <label className="flex items-center gap-2">
            <span className="flex-1 min-w-0 text-[11.5px] text-[#514B67] whitespace-nowrap">All other states (₦)</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={form.deliveryFee}
              onChange={(e) => set({ deliveryFee: e.target.value })}
              placeholder="e.g. 6000"
              className={`w-[96px] shrink-0 ${box}`}
            />
            <span className="w-[26px]" />
          </label>
        </div>
      )}
    </div>
  );
}
