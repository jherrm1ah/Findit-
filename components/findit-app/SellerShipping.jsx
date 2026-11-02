"use client";

import { useEffect, useState } from "react";
import { Truck, MapPin, Plus, X, Trash2, Star, Store, PlugZap, Package, ChevronDown, ChevronUp } from "lucide-react";
import { NIGERIAN_STATES } from "@/lib/deliveryShared";
import { deliveryPerformance, DISPATCH_TARGET_HOURS } from "@/lib/shipping/performance";
import { naira } from "./data";
import { api } from "./api";
import { Field } from "./shared";

// Shipping & delivery settings (docs/SHIPPING.md):
// - Rates: shipping profiles. Each has zones (states, or cities and
//   neighbourhoods for local delivery) and rates in each zone: free, flat,
//   by order value, by weight, or local rider; plus a free-shipping threshold.
// - Locations: where the seller ships from, and where buyers can collect
//   (hours and instructions).
// - Carriers: logistics providers. None is connected: FindIt never shows a
//   carrier price it didn't get from the carrier.

const input = "w-full bg-white border border-[#ECE9F7] rounded-lg px-3 py-2 text-[12.5px] outline-none";
const card = "bg-white border border-[#ECE9F7] rounded-[20px] p-4 shadow-sm shadow-[#4C1D95]/5";
const primary = "text-white text-[12px] font-semibold px-4 py-2 rounded-xl disabled:opacity-50";
const primaryStyle = { background: "linear-gradient(135deg,#A855F7,#7C3AED)" };

export const METHOD_LABELS = {
  free: "Free shipping",
  flat: "Flat rate",
  price: "By order value",
  weight: "By weight",
  local: "Local delivery (your riders)",
};

const kg = (g) => (g == null || g === "" ? "" : String(Number(g) / 1000));
const grams = (v) => (v === "" || v == null ? null : Math.round(Number(v) * 1000));
const blankRate = () => ({ name: "Standard", method: "flat", amount: "", etaMinDays: "", etaMaxDays: "" });
const blankZone = () => ({ name: "", states: [], areas: "", rates: [blankRate()] });

// A profile from the API as an editable form (weights in kg, areas as text).
function toForm(p) {
  if (!p) {
    return { name: "", isDefault: false, freeShippingOver: "", locationId: "", zones: [{ ...blankZone(), name: "Nigeria", states: ["*"] }] };
  }
  return {
    id: p.id,
    name: p.name,
    isDefault: p.isDefault,
    freeShippingOver: p.freeShippingOver ? String(p.freeShippingOver) : "",
    locationId: p.locationId ?? "",
    zones: p.zones.map((z) => ({
      name: z.name,
      states: z.states,
      areas: z.areas.join(", "),
      rates: z.rates.map((r) => ({
        name: r.name,
        method: r.method,
        amount: r.method === "free" ? "" : String(r.amount),
        minOrder: r.minOrder ?? "",
        maxOrder: r.maxOrder ?? "",
        minWeightKg: kg(r.minWeightG),
        maxWeightKg: kg(r.maxWeightG),
        baseWeightKg: kg(r.baseWeightG),
        perExtraKg: r.perExtraKg ?? "",
        etaMinDays: r.etaMinDays ?? "",
        etaMaxDays: r.etaMaxDays ?? "",
      })),
    })),
  };
}

function toPayload(f) {
  return {
    id: f.id,
    name: f.name,
    isDefault: f.isDefault,
    freeShippingOver: f.freeShippingOver || null,
    locationId: f.locationId || null,
    zones: f.zones.map((z) => ({
      name: z.name,
      states: z.states,
      areas: z.areas.split(",").map((a) => a.trim()).filter(Boolean),
      rates: z.rates.map((r) => ({
        name: r.name,
        method: r.method,
        amount: r.method === "free" ? 0 : r.amount,
        minOrder: r.minOrder,
        maxOrder: r.maxOrder,
        minWeightG: grams(r.minWeightKg),
        maxWeightG: grams(r.maxWeightKg),
        baseWeightG: grams(r.baseWeightKg),
        perExtraKg: r.perExtraKg,
        etaMinDays: r.etaMinDays,
        etaMaxDays: r.etaMaxDays,
      })),
    })),
  };
}

function rateLine(r) {
  const fee = r.method === "free" ? "Free" : naira(r.amount);
  const when =
    r.method === "price"
      ? ` · orders ${r.minOrder != null ? `from ${naira(r.minOrder)}` : ""}${r.minOrder != null && r.maxOrder != null ? " " : ""}${r.maxOrder != null ? `under ${naira(r.maxOrder)}` : ""}`
      : r.method === "weight"
        ? ` · ${r.minWeightG != null ? `${r.minWeightG / 1000}kg` : "0kg"}–${r.maxWeightG != null ? `${r.maxWeightG / 1000}kg` : "any"}${r.perExtraKg ? `, +${naira(r.perExtraKg)}/kg over ${(r.baseWeightG ?? 0) / 1000}kg` : ""}`
        : "";
  const lo = r.etaMinDays ?? r.etaMaxDays;
  const eta =
    r.etaMaxDays == null ? "" : r.etaMaxDays === 0 ? " · same day" : lo === r.etaMaxDays ? ` · ${lo} day${lo === 1 ? "" : "s"}` : ` · ${lo}–${r.etaMaxDays} days`;
  return `${r.name}: ${fee}${when}${eta}`;
}

function StatesPicker({ value, onChange }) {
  const [pick, setPick] = useState("");
  const add = (s) => {
    if (s && !value.includes(s)) onChange([...value, s]);
    setPick("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {value.map((s) => (
          <span key={s} className="flex items-center gap-1 text-[11px] font-medium text-[#4C1D95] bg-[#F5F2FC] px-2 py-1 rounded-full">
            {s === "*" ? "All other states" : s}
            <button type="button" onClick={() => onChange(value.filter((v) => v !== s))} aria-label={`Remove ${s === "*" ? "all other states" : s}`}>
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
      <select value={pick} onChange={(e) => add(e.target.value)} className={input} aria-label="Add a state">
        <option value="">Add a state…</option>
        {!value.includes("*") && <option value="*">All other states (rest of Nigeria)</option>}
        {NIGERIAN_STATES.filter((s) => !value.includes(s)).map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
  );
}

function RateEditor({ rate, onChange, onRemove }) {
  const set = (patch) => onChange({ ...rate, ...patch });
  const m = rate.method;
  return (
    <div className="bg-[#FAFAFF] border border-[#ECE9F7] rounded-xl p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Name buyers see">
          <input value={rate.name} onChange={(e) => set({ name: e.target.value })} placeholder="Standard, Express…" className={input} />
        </Field>
        <Field label="How it's priced">
          <select value={m} onChange={(e) => set({ method: e.target.value })} className={input}>
            {Object.entries(METHOD_LABELS).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        </Field>
      </div>
      {m !== "free" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label={m === "weight" ? "Fee (₦), up to the included weight" : "Fee (₦)"}>
            <input type="number" min={0} inputMode="numeric" value={rate.amount} onChange={(e) => set({ amount: e.target.value })} className={input} />
          </Field>
          {m === "weight" && (
            <Field label="Weight included (kg)">
              <input type="number" min={0} step="0.1" value={rate.baseWeightKg ?? ""} onChange={(e) => set({ baseWeightKg: e.target.value })} className={input} />
            </Field>
          )}
        </div>
      )}
      {m === "price" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Orders from (₦)">
            <input type="number" min={0} inputMode="numeric" value={rate.minOrder ?? ""} onChange={(e) => set({ minOrder: e.target.value })} placeholder="0" className={input} />
          </Field>
          <Field label="Up to, not incl. (₦)">
            <input type="number" min={1} inputMode="numeric" value={rate.maxOrder ?? ""} onChange={(e) => set({ maxOrder: e.target.value })} placeholder="no limit" className={input} />
          </Field>
        </div>
      )}
      {m === "weight" && (
        <div className="grid grid-cols-3 gap-2">
          <Field label="Each extra kg (₦)">
            <input type="number" min={0} inputMode="numeric" value={rate.perExtraKg ?? ""} onChange={(e) => set({ perExtraKg: e.target.value })} className={input} />
          </Field>
          <Field label="From (kg)">
            <input type="number" min={0} step="0.1" value={rate.minWeightKg ?? ""} onChange={(e) => set({ minWeightKg: e.target.value })} placeholder="0" className={input} />
          </Field>
          <Field label="Up to (kg)">
            <input type="number" min={0} step="0.1" value={rate.maxWeightKg ?? ""} onChange={(e) => set({ maxWeightKg: e.target.value })} placeholder="any" className={input} />
          </Field>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 items-end">
        <Field label="Delivery estimate (days)">
          <div className="flex items-center gap-1.5">
            <input type="number" min={0} max={60} value={rate.etaMinDays ?? ""} onChange={(e) => set({ etaMinDays: e.target.value })} placeholder="1" className={input} aria-label="Fastest, in days" />
            <span className="text-[11px] text-[#8A8372]">to</span>
            <input type="number" min={0} max={60} value={rate.etaMaxDays ?? ""} onChange={(e) => set({ etaMaxDays: e.target.value })} placeholder="3" className={input} aria-label="Slowest, in days" />
          </div>
        </Field>
        <button type="button" onClick={onRemove} className="justify-self-end flex items-center gap-1 text-[11.5px] font-semibold text-[#B91C1C] pb-2">
          <Trash2 size={12} /> Remove rate
        </button>
      </div>
    </div>
  );
}

function ProfileEditor({ initial, locations, onSaved, onCancel, onDeleted, showToast }) {
  const [f, setF] = useState(() => toForm(initial));
  const [saving, setSaving] = useState(false);
  const setZone = (i, patch) => setF({ ...f, zones: f.zones.map((z, j) => (j === i ? { ...z, ...patch } : z)) });

  const save = async () => {
    setSaving(true);
    try {
      onSaved(await api.saveShippingProfile(toPayload(f)));
      showToast?.("Shipping profile saved.");
    } catch (err) {
      showToast?.(err.message || "Couldn't save that profile.", "error");
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!f.id) return onCancel();
    setSaving(true);
    try {
      await api.deleteShippingProfile(f.id);
      onDeleted(f.id);
      showToast?.("Profile deleted. Its listings now use their own pricing or your default profile.");
    } catch (err) {
      showToast?.(err.message || "Couldn't delete that profile.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`${card} space-y-3`}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Profile name">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Small parcels" className={input} />
        </Field>
        <Field label="Free shipping on orders from (₦)">
          <input type="number" min={1} inputMode="numeric" value={f.freeShippingOver} onChange={(e) => setF({ ...f, freeShippingOver: e.target.value })} placeholder="optional" className={input} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2 items-end">
        <Field label="Ships from">
          <select value={f.locationId} onChange={(e) => setF({ ...f, locationId: e.target.value })} className={input}>
            <option value="">—</option>
            {locations.filter((l) => l.shipsFrom).map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-[12px] text-[#514B67] pb-2">
          <input type="checkbox" checked={f.isDefault} onChange={(e) => setF({ ...f, isDefault: e.target.checked })} />
          Default for my listings
        </label>
      </div>

      {f.zones.map((z, i) => (
        <div key={i} className="border border-[#ECE9F7] rounded-2xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-[#7C3AED] shrink-0" />
            <input value={z.name} onChange={(e) => setZone(i, { name: e.target.value })} placeholder="Zone name, e.g. Lagos" className={`${input} font-semibold`} aria-label="Zone name" />
            {f.zones.length > 1 && (
              <button type="button" onClick={() => setF({ ...f, zones: f.zones.filter((_, j) => j !== i) })} aria-label="Remove zone" className="p-1.5 text-[#8A8372]">
                <X size={14} />
              </button>
            )}
          </div>
          <Field label="States">
            <StatesPicker value={z.states} onChange={(states) => setZone(i, { states })} />
          </Field>
          <Field label="Only these cities / neighbourhoods (optional, comma-separated)">
            <input value={z.areas} onChange={(e) => setZone(i, { areas: e.target.value })} placeholder="e.g. Lekki, Victoria Island, Ikoyi" className={input} />
          </Field>
          {z.rates.map((r, ri) => (
            <RateEditor
              key={ri}
              rate={r}
              onChange={(rate) => setZone(i, { rates: z.rates.map((x, k) => (k === ri ? rate : x)) })}
              onRemove={() => setZone(i, { rates: z.rates.filter((_, k) => k !== ri) })}
            />
          ))}
          <button type="button" onClick={() => setZone(i, { rates: [...z.rates, blankRate()] })} className="flex items-center gap-1 text-[11.5px] font-semibold text-[#7C3AED]">
            <Plus size={13} /> Add a rate
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setF({ ...f, zones: [...f.zones, blankZone()] })} className="flex items-center gap-1 text-[12px] font-semibold text-[#7C3AED]">
        <Plus size={13} /> Add a delivery zone
      </button>

      <div className="flex gap-2 pt-1">
        <button onClick={save} disabled={saving} className={`flex-1 ${primary}`} style={primaryStyle}>
          {saving ? "Saving…" : "Save profile"}
        </button>
        <button onClick={onCancel} disabled={saving} className="px-3 text-[12px] font-semibold text-[#6B6483] border border-[#ECE9F7] rounded-xl bg-white">
          Cancel
        </button>
        {f.id && (
          <button onClick={remove} disabled={saving} className="px-3 text-[12px] font-semibold text-[#B91C1C] border border-[#F3D9D9] rounded-xl bg-white" aria-label="Delete profile">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

const blankLocation = { name: "", address: "", area: "", state: "", phone: "", shipsFrom: true, pickupEnabled: false, pickupHours: "", pickupInstructions: "", isDefault: false };

function LocationEditor({ initial, onSaved, onCancel, onDeleted, showToast }) {
  const [f, setF] = useState(() => ({ ...blankLocation, ...(initial ?? {}), pickupHours: initial?.pickupHours ?? "", pickupInstructions: initial?.pickupInstructions ?? "", phone: initial?.phone ?? "" }));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      onSaved(await api.saveShippingLocation(f));
      showToast?.("Location saved.");
    } catch (err) {
      showToast?.(err.message || "Couldn't save that location.", "error");
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    setSaving(true);
    try {
      await api.deleteShippingLocation(f.id);
      onDeleted(f.id);
    } catch (err) {
      showToast?.(err.message || "Couldn't delete that location.", "error");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className={`${card} space-y-2.5`}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Name">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Ikeja shop" className={input} />
        </Field>
        <Field label="Phone (optional)">
          <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} type="tel" className={input} />
        </Field>
      </div>
      <Field label="Street address">
        <input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} className={input} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Area / city">
          <input value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} className={input} />
        </Field>
        <Field label="State">
          <select value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} className={input}>
            <option value="">Choose…</option>
            {NIGERIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-[12px] text-[#514B67]">
        <input type="checkbox" checked={f.shipsFrom} onChange={(e) => setF({ ...f, shipsFrom: e.target.checked })} />
        Orders are sent out from here
      </label>
      <label className="flex items-center gap-2 text-[12px] text-[#514B67]">
        <input type="checkbox" checked={f.pickupEnabled} onChange={(e) => setF({ ...f, pickupEnabled: e.target.checked })} />
        Buyers can pick up here
      </label>
      {f.pickupEnabled && (
        <>
          <Field label="Pickup hours">
            <input value={f.pickupHours} onChange={(e) => setF({ ...f, pickupHours: e.target.value })} placeholder="e.g. Mon–Sat, 9am–6pm" className={input} />
          </Field>
          <Field label="Pickup instructions (optional)">
            <input value={f.pickupInstructions} onChange={(e) => setF({ ...f, pickupInstructions: e.target.value })} placeholder="e.g. Ask for Tunde at the counter" className={input} />
          </Field>
        </>
      )}
      <div className="flex gap-2 pt-1">
        <button onClick={save} disabled={saving} className={`flex-1 ${primary}`} style={primaryStyle}>{saving ? "Saving…" : "Save location"}</button>
        <button onClick={onCancel} disabled={saving} className="px-3 text-[12px] font-semibold text-[#6B6483] border border-[#ECE9F7] rounded-xl bg-white">Cancel</button>
        {f.id && (
          <button onClick={remove} disabled={saving} className="px-3 text-[12px] font-semibold text-[#B91C1C] border border-[#F3D9D9] rounded-xl bg-white" aria-label="Delete location">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

const CAPABILITY_LABELS = { quotes: "Live rates", shipments: "Book pickups", labels: "Labels", tracking: "Tracking", cancellation: "Cancel", webhooks: "Live updates" };

function Stat({ label, value, warn }) {
  return (
    <div className="bg-white border border-[#ECE9F7] rounded-2xl py-3 px-2 text-center">
      <p className={`text-[15px] font-bold ${warn ? "text-[#B45309]" : "text-[#1E1B4B]"}`}>{value}</p>
      <p className="text-[9.5px] text-[#8A8372] uppercase tracking-wide leading-tight">{label}</p>
    </div>
  );
}

function Shipments({ orders }) {
  const perf = deliveryPerformance(orders);
  const inFlight = orders.filter((o) => o.paymentStatus === "paid" && o.status !== "Cancelled" && !o.buyerConfirmedAt);
  const fmtHours = (h) => (h == null ? "—" : h < 24 ? `${Math.round(h)}h` : `${Math.round((h / 24) * 10) / 10}d`);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="To send out" value={perf.awaitingDispatch} warn={perf.lateToDispatch > 0} />
        <Stat label="Avg. time to send" value={fmtHours(perf.avgHoursToDispatch)} />
        <Stat label="On time" value={perf.onTimeRate == null ? "—" : `${perf.onTimeRate}%`} />
      </div>
      {perf.lateToDispatch > 0 && (
        <p className="text-[11.5px] text-[#B45309] bg-[#FDF6EC] rounded-xl px-3 py-2">
          {perf.lateToDispatch} paid order{perf.lateToDispatch === 1 ? " has" : "s have"} waited more than {DISPATCH_TARGET_HOURS} hours to be sent out.
        </p>
      )}
      <p className="text-[11px] text-[#8A8372]">
        On time: confirmed within the delivery estimate you gave (plus a day). Average arrival: {perf.avgDaysToArrive == null ? "—" : `${perf.avgDaysToArrive} days`} from payment.
      </p>
      {inFlight.length === 0 ? (
        <p className="text-[12px] text-[#6B6483]">Nothing on its way right now.</p>
      ) : (
        inFlight.map((o) => (
          <div key={o.id} className={card}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[12.5px] font-semibold text-[#1E1B4B] truncate">{o.item}</p>
                <p className="text-[11px] text-[#6B6483]">
                  {o.id} · {o.deliveryMethod === "pickup" ? (o.pickupStatus === "ready" ? "Ready to collect" : "Pickup") : o.status}
                  {o.shippingOption ? ` · ${o.shippingOption.name}` : ""}
                </p>
              </div>
              {o.shipment?.trackingNumber && <span className="text-[10.5px] font-mono text-[#514B67] shrink-0">{o.shipment.trackingNumber}</span>}
            </div>
            {o.shipment && (
              <p className="text-[11px] text-[#514B67] mt-1">
                {o.shipment.carrier} · {o.shipment.events?.[o.shipment.events.length - 1]?.description ?? o.shipment.status}
              </p>
            )}
          </div>
        ))
      )}
    </div>
  );
}

export default function SellerShipping({ showToast, onProfilesChange, orders = [] }) {
  const [tab, setTab] = useState("rates");
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // profile id, "new", or null
  const [editingLocation, setEditingLocation] = useState(null);
  const [openProfile, setOpenProfile] = useState(null);

  useEffect(() => {
    api.getShipping().then(setConfig).catch((err) => setError(err.message || "Couldn't load your shipping settings."));
  }, []);
  useEffect(() => {
    if (config) onProfilesChange?.(config.profiles);
  }, [config, onProfilesChange]);

  if (error) return <p className="text-[12px] text-[#B91C1C]">{error}</p>;
  if (!config) return <p className="text-[12px] text-[#6B6483]">Loading shipping settings…</p>;

  const upsert = (list, item) => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]);
  const savedProfile = (p) => {
    setConfig((c) => ({ ...c, profiles: upsert(c.profiles, p).map((x) => (p.isDefault && x.id !== p.id ? { ...x, isDefault: false } : x)) }));
    setEditing(null);
  };
  const methodsInUse = new Set(config.profiles.flatMap((p) => p.zones.flatMap((z) => z.rates.map((r) => r.method))));
  const pickupCount = config.locations.filter((l) => l.pickupEnabled && l.active).length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Truck size={16} className="text-[#7C3AED]" />
        <p className="text-[15px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>Shipping & delivery</p>
      </div>
      <p className="text-[11.5px] text-[#6B6483] mb-3">
        {config.profiles.length === 0
          ? "No shipping profiles yet: each listing uses its own delivery pricing."
          : `Methods in use: ${[...methodsInUse].map((m) => METHOD_LABELS[m]).join(", ") || "none"}${pickupCount ? ` · Pickup at ${pickupCount} location${pickupCount === 1 ? "" : "s"}` : ""}`}
      </p>

      <div className="flex gap-1.5 mb-4">
        {[["rates", "Rates", Package], ["locations", "Pickup", Store], ["shipments", "Shipments", Truck], ["carriers", "Carriers", PlugZap]].map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1 text-[11.5px] font-semibold px-3 py-1.5 rounded-full border ${tab === key ? "text-white border-transparent" : "bg-white text-[#514B67] border-[#ECE9F7]"}`}
            style={tab === key ? primaryStyle : {}}
          >
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>

      {tab === "rates" && (
        <div className="space-y-3">
          {config.profiles.map((p) =>
            editing === p.id ? (
              <ProfileEditor
                key={p.id}
                initial={p}
                locations={config.locations}
                onSaved={savedProfile}
                onCancel={() => setEditing(null)}
                onDeleted={(id) => {
                  setConfig((c) => ({ ...c, profiles: c.profiles.filter((x) => x.id !== id) }));
                  setEditing(null);
                }}
                showToast={showToast}
              />
            ) : (
              <div key={p.id} className={card}>
                <div className="flex items-start justify-between gap-2">
                  <button className="text-left flex-1" onClick={() => setOpenProfile(openProfile === p.id ? null : p.id)}>
                    <p className="text-[13px] font-semibold text-[#1E1B4B] flex items-center gap-1.5">
                      {p.name}
                      {p.isDefault && (
                        <span className="flex items-center gap-0.5 text-[9.5px] font-bold text-[#7C3AED] bg-[#F5F2FC] px-1.5 py-0.5 rounded-full">
                          <Star size={9} /> DEFAULT
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-[#6B6483]">
                      {p.zones.length} zone{p.zones.length === 1 ? "" : "s"} · {p.productCount ?? 0} listing{p.productCount === 1 ? "" : "s"}
                      {p.freeShippingOver ? ` · Free from ${naira(p.freeShippingOver)}` : ""}
                    </p>
                  </button>
                  <button onClick={() => setEditing(p.id)} className="text-[11.5px] font-semibold text-[#7C3AED]">Edit</button>
                  <button onClick={() => setOpenProfile(openProfile === p.id ? null : p.id)} aria-label="Show zones" className="text-[#8A8372]">
                    {openProfile === p.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                </div>
                {openProfile === p.id && (
                  <div className="mt-2.5 space-y-2">
                    {p.zones.map((z) => (
                      <div key={z.id} className="bg-[#FAFAFF] rounded-xl px-3 py-2">
                        <p className="text-[12px] font-semibold text-[#1E1B4B]">
                          {z.name}{" "}
                          <span className="font-normal text-[#6B6483]">
                            · {z.states.map((s) => (s === "*" ? "all other states" : s)).join(", ")}
                            {z.areas.length ? ` (${z.areas.join(", ")})` : ""}
                          </span>
                        </p>
                        {z.rates.map((r) => (
                          <p key={r.id} className="text-[11.5px] text-[#514B67]">{rateLine(r)}</p>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          )}
          {editing === "new" ? (
            <ProfileEditor initial={null} locations={config.locations} onSaved={savedProfile} onCancel={() => setEditing(null)} onDeleted={() => setEditing(null)} showToast={showToast} />
          ) : (
            <button onClick={() => setEditing("new")} className={`w-full ${primary} py-2.5`} style={primaryStyle}>
              <span className="flex items-center justify-center gap-1"><Plus size={14} /> New shipping profile</span>
            </button>
          )}
          <p className="text-[11px] text-[#8A8372]">
            A listing uses the profile you pick for it, or its own delivery pricing, or else your default profile. Buyers see the options for their address at checkout, with the fee and estimate, before paying.
          </p>
        </div>
      )}

      {tab === "locations" && (
        <div className="space-y-3">
          {config.locations.map((l) =>
            editingLocation === l.id ? (
              <LocationEditor
                key={l.id}
                initial={l}
                onSaved={(loc) => {
                  setConfig((c) => ({ ...c, locations: upsert(c.locations, loc).map((x) => (loc.isDefault && x.id !== loc.id ? { ...x, isDefault: false } : x)) }));
                  setEditingLocation(null);
                }}
                onCancel={() => setEditingLocation(null)}
                onDeleted={(id) => {
                  setConfig((c) => ({ ...c, locations: c.locations.filter((x) => x.id !== id) }));
                  setEditingLocation(null);
                }}
                showToast={showToast}
              />
            ) : (
              <div key={l.id} className={`${card} flex items-start justify-between gap-2`}>
                <div>
                  <p className="text-[13px] font-semibold text-[#1E1B4B]">{l.name}</p>
                  <p className="text-[11.5px] text-[#514B67]">{l.address}, {l.area}, {l.state}</p>
                  <p className="text-[11px] text-[#6B6483]">
                    {[l.shipsFrom && "Ships from here", l.pickupEnabled && `Pickup: ${l.pickupHours}`].filter(Boolean).join(" · ") || "Not used for orders"}
                  </p>
                </div>
                <button onClick={() => setEditingLocation(l.id)} className="text-[11.5px] font-semibold text-[#7C3AED]">Edit</button>
              </div>
            )
          )}
          {editingLocation === "new" ? (
            <LocationEditor
              initial={null}
              onSaved={(loc) => {
                setConfig((c) => ({ ...c, locations: upsert(c.locations, loc) }));
                setEditingLocation(null);
              }}
              onCancel={() => setEditingLocation(null)}
              onDeleted={() => setEditingLocation(null)}
              showToast={showToast}
            />
          ) : (
            <button onClick={() => setEditingLocation("new")} className={`w-full ${primary} py-2.5`} style={primaryStyle}>
              <span className="flex items-center justify-center gap-1"><Plus size={14} /> Add a location</span>
            </button>
          )}
          <p className="text-[11px] text-[#8A8372]">Pickup locations appear at checkout when a buyer chooses pickup, with your hours and instructions. Pickup is always free.</p>
        </div>
      )}

      {tab === "shipments" && <Shipments orders={orders} />}

      {tab === "carriers" && (
        <div className="space-y-3">
          <div className="bg-[#F5F2FC] rounded-[20px] p-4">
            <p className="text-[12.5px] font-semibold text-[#1E1B4B] mb-1">No carrier is connected yet</p>
            <p className="text-[11.5px] text-[#514B67]">
              Live carrier prices appear at checkout only once FindIt connects to a logistics provider with real credentials. Until then, buyers see the rates you set, marked as your own.
            </p>
          </div>
          {config.carriers.map((c) => (
            <div key={c.key} className={card}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[13px] font-semibold text-[#1E1B4B]">{c.name}</p>
                <span className="text-[10px] font-semibold text-[#6B6483] bg-[#F0ECFA] px-2 py-0.5 rounded-full">
                  {c.status === "connected" ? "Connected" : c.status === "needs_credentials" ? "Needs credentials" : "Not connected"}
                </span>
              </div>
              <p className="text-[11.5px] text-[#514B67] mb-2">{c.verified}</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(c.capabilities).map(([k, v]) => (
                  <span key={k} className={`text-[10.5px] px-2 py-0.5 rounded-full ${v === true ? "bg-[#ECFDF3] text-[#15803D]" : "bg-[#F4F3F8] text-[#8A8372]"}`}>
                    {CAPABILITY_LABELS[k]}{v === null ? " ?" : ""}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
