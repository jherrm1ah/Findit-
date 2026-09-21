"use client";

import { useEffect, useMemo, useState } from "react";
import NextImage from "next/image";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, Send, LayoutDashboard, Package, ArrowRight, Plus, Pencil, Trash2, Image as ImageIcon, MapPin, Clock, MessageCircle, Crown, EyeOff, Palette, Lock, BarChart3, TrendingUp, ShieldCheck, ShieldAlert, Landmark, Link2 as LinkIcon, Star, X, Sparkles, ClipboardList, Store, Copy, Check } from "lucide-react";
import { naira, SELLER_STEPS, GROUPS } from "./data";
import { Pill, Field } from "./shared";
import { api } from "./api";
import { haversineKm, formatDistanceKm } from "@/lib/geo";
import { DURATION, EASE, STAGGER_CONTAINER, STAGGER_ITEM, press } from "./motion";

function budgetLabel(r) {
  if (!r.budgetMin && !r.budgetMax) return "Open";
  if (r.budgetMin && r.budgetMax && r.budgetMin !== r.budgetMax) {
    return `${naira(r.budgetMin)}–${naira(r.budgetMax).replace("₦", "")}`;
  }
  return naira(r.budgetMax || r.budgetMin);
}

function statusTone(status) {
  if (status === "Delivered") return "green";
  if (status === "Awaiting payment") return "stone";
  return "gold";
}

// SELLER_STEPS deliberately excludes "Delivered" (only the buyer can mark an
// order delivered) — so SELLER_STEPS.indexOf("Delivered") returns -1, and a
// naive `SELLER_STEPS[SELLER_STEPS.indexOf(status) + 1]` reads index 0
// instead of "no next step": every delivered order would compute
// nextStatus = "Awaiting payment" (index 0's value, truthy), rendering an
// enabled "Mark as Awaiting payment" button on every completed order
// instead of the "Delivered — payment released" pill.
function nextSellerStep(status) {
  if (status === "Delivered") return undefined;
  return SELLER_STEPS[SELLER_STEPS.indexOf(status) + 1];
}

const EMPTY_OFFER = { price: "", delivery: "", eta: "", warranty: "", note: "" };

function OfferForm({ onSend, onCancel, sending }) {
  const [form, setForm] = useState(EMPTY_OFFER);
  const valid = Number(form.price) > 0 && form.delivery.trim() && form.eta.trim() && form.warranty.trim();

  return (
    <div className="bg-[#F5F2FC] rounded-xl p-3 mt-2 space-y-2.5">
      <Field label="Your price (₦)">
        <input
          type="number"
          min={1}
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
          className="w-full bg-white border border-[#ECE9F7] rounded-lg px-3 py-2 text-[12.5px] outline-none"
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Delivery (₦ or 'Pickup only')">
          <input
            value={form.delivery}
            onChange={(e) => setForm({ ...form, delivery: e.target.value })}
            placeholder="e.g. 2,000"
            className="w-full bg-white border border-[#ECE9F7] rounded-lg px-3 py-2 text-[12.5px] outline-none"
          />
        </Field>
        <Field label="ETA">
          <input
            value={form.eta}
            onChange={(e) => setForm({ ...form, eta: e.target.value })}
            placeholder="e.g. 1–2 days"
            className="w-full bg-white border border-[#ECE9F7] rounded-lg px-3 py-2 text-[12.5px] outline-none"
          />
        </Field>
      </div>
      <Field label="Warranty">
        <input
          value={form.warranty}
          onChange={(e) => setForm({ ...form, warranty: e.target.value })}
          placeholder="e.g. 6 months, or 'No warranty'"
          className="w-full bg-white border border-[#ECE9F7] rounded-lg px-3 py-2 text-[12.5px] outline-none"
        />
      </Field>
      <Field label="Note to buyer (optional)">
        <textarea
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          rows={2}
          className="w-full bg-white border border-[#ECE9F7] rounded-lg px-3 py-2 text-[12.5px] outline-none resize-none"
        />
      </Field>
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onSend(form)}
          disabled={sending || !valid}
          className={`flex-1 text-white text-[12px] font-semibold py-2 rounded-lg ${sending || !valid ? "opacity-50" : ""}`}
          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
        >
          {sending ? "Sending…" : "Send offer"}
        </button>
        <button onClick={onCancel} disabled={sending} className="px-3 text-[12px] font-semibold text-[#6B6483] border border-[#ECE9F7] rounded-lg bg-white">
          Cancel
        </button>
      </div>
    </div>
  );
}

// Keep in sync with lib/repo.ts#MAX_PRODUCT_IMAGES — this just decides when
// to hide the "add photo" slot, the server is what actually enforces it.
const MAX_PRODUCT_IMAGES = 4;
const DELIVERY_OPTIONS = ["Delivery", "Pickup", "Both"];

const EMPTY_FORM = {
  name: "",
  category: Object.keys(GROUPS)[0],
  price: "",
  images: [],
  description: "",
  condition: "New",
  qty: "1",
  location: "",
  deliveryOption: "Delivery",
  color: "",
  variation: "",
};

function ListingForm({ initial, onSave, onCancel, saving, onUploadImage }) {
  const [form, setForm] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);

  const addPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const url = await onUploadImage(file);
      setForm((f) => ({ ...f, images: [...f.images, url] }));
    } catch {
      // onUploadImage already surfaces a toast on failure
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (url) => setForm((f) => ({ ...f, images: f.images.filter((u) => u !== url) }));

  const generateDescription = async () => {
    setGeneratingDescription(true);
    try {
      const description = await api.generateProductDescription({
        name: form.name,
        categoryLabel: GROUPS[form.category]?.label ?? form.category,
        condition: form.condition || null,
        color: form.color || null,
        variation: form.variation || null,
      });
      setForm((f) => ({ ...f, description }));
    } catch {
      // MainApp already surfaces a toast on the underlying request; nothing
      // else to do here but leave the field as the seller left it.
    } finally {
      setGeneratingDescription(false);
    }
  };

  const valid = form.name.trim() && Number(form.price) > 0 && form.condition && form.deliveryOption;

  return (
    <div className="bg-[#F5F2FC] rounded-xl p-3 mt-2 space-y-2.5">
      <Field label={`Photos (${form.images.length}/${MAX_PRODUCT_IMAGES})`}>
        <div className="flex items-center gap-2 flex-wrap">
          {form.images.map((url) => (
            <div key={url} className="relative w-16 h-16 rounded-lg overflow-hidden bg-white border border-[#ECE9F7]">
              <NextImage src={url} alt="" fill sizes="64px" className="object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(url)}
                aria-label="Remove photo"
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 flex items-center justify-center"
              >
                <X size={10} className="text-white" />
              </button>
            </div>
          ))}
          {form.images.length < MAX_PRODUCT_IMAGES && (
            <label className={`w-16 h-16 rounded-lg border border-dashed border-[#7C3AED]/40 bg-white flex items-center justify-center cursor-pointer shrink-0 ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
              {uploading ? (
                <span className="text-[9px] text-[#7C3AED] font-semibold">Uploading…</span>
              ) : (
                <Plus size={18} className="text-[#7C3AED]" />
              )}
              <input type="file" accept="image/*" className="hidden" onChange={addPhoto} disabled={uploading} />
            </label>
          )}
        </div>
      </Field>
      <Field label="Product name">
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full bg-white border border-[#ECE9F7] rounded-lg px-3 py-2 text-[12.5px] outline-none"
        />
      </Field>
      <Field label="Category">
        <select
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          className="w-full bg-white border border-[#ECE9F7] rounded-lg px-3 py-2 text-[12.5px] outline-none"
        >
          {Object.entries(GROUPS).map(([key, g]) => (
            <option key={key} value={key}>{g.label}</option>
          ))}
        </select>
      </Field>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="block text-[11.5px] font-medium text-[#514B67]">Description</span>
          <button
            type="button"
            onClick={generateDescription}
            disabled={generatingDescription || !form.name.trim()}
            className={`flex items-center gap-1 text-[10.5px] font-semibold text-[#7C3AED] ${generatingDescription || !form.name.trim() ? "opacity-40" : ""}`}
          >
            <Sparkles size={11} /> {generatingDescription ? "Generating…" : "Generate with AI"}
          </button>
        </div>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={3}
          placeholder="What is it, what condition, anything a buyer should know?"
          className="w-full bg-white border border-[#ECE9F7] rounded-lg px-3 py-2 text-[12.5px] outline-none resize-none"
        />
      </div>
      <Field label="Price (₦)">
        <input
          type="number"
          min={1}
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
          className="w-full bg-white border border-[#ECE9F7] rounded-lg px-3 py-2 text-[12.5px] outline-none"
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Condition">
          <select
            value={form.condition}
            onChange={(e) => setForm({ ...form, condition: e.target.value })}
            className="w-full bg-white border border-[#ECE9F7] rounded-lg px-3 py-2 text-[12.5px] outline-none"
          >
            <option value="New">New</option>
            {/* FindIt only accepts new-condition listings going forward —
                "Used" is never offered for a new listing. It only appears
                here at all when editing a listing that was already Used
                before this policy, so a seller keeps full control over an
                item they've already honestly listed (switch it to New, or
                leave it as the accurate Used it always was) without being
                silently relabeled or locked out of editing anything else
                on it. */}
            {initial.condition === "Used" && <option value="Used">Used</option>}
          </select>
          {initial.condition !== "Used" && (
            <p className="text-[10px] text-[#8A8372] mt-1">FindIt is new-condition items only.</p>
          )}
        </Field>
        <Field label="Quantity available">
          <input
            type="number"
            min={0}
            value={form.qty}
            onChange={(e) => setForm({ ...form, qty: e.target.value })}
            className="w-full bg-white border border-[#ECE9F7] rounded-lg px-3 py-2 text-[12.5px] outline-none"
          />
        </Field>
      </div>
      <Field label="Location">
        <input
          value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
          placeholder="e.g. Yaba, Lagos"
          className="w-full bg-white border border-[#ECE9F7] rounded-lg px-3 py-2 text-[12.5px] outline-none"
        />
      </Field>
      <Field label="Delivery option">
        <select
          value={form.deliveryOption}
          onChange={(e) => setForm({ ...form, deliveryOption: e.target.value })}
          className="w-full bg-white border border-[#ECE9F7] rounded-lg px-3 py-2 text-[12.5px] outline-none"
        >
          {DELIVERY_OPTIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </Field>
      <p className="text-[10.5px] font-medium text-[#8A8372] uppercase tracking-wide pt-1">Optional</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Color">
          <input
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            className="w-full bg-white border border-[#ECE9F7] rounded-lg px-3 py-2 text-[12.5px] outline-none"
          />
        </Field>
        <Field label="Size / variation">
          <input
            value={form.variation}
            onChange={(e) => setForm({ ...form, variation: e.target.value })}
            placeholder="only when relevant"
            className="w-full bg-white border border-[#ECE9F7] rounded-lg px-3 py-2 text-[12.5px] outline-none"
          />
        </Field>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onSave(form)}
          disabled={saving || uploading || !valid}
          className={`flex-1 text-white text-[12px] font-semibold py-2 rounded-lg ${saving || uploading || !valid ? "opacity-50" : ""}`}
          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} disabled={saving} className="px-3 text-[12px] font-semibold text-[#6B6483] border border-[#ECE9F7] rounded-lg bg-white">
          Cancel
        </button>
      </div>
    </div>
  );
}

// Real backing for the plan's "customization" benefit — a Free/Basic seller
// sees exactly why this is locked and what unlocks it; a Business/Pro
// seller can actually set the images that show on their public storefront
// (see SellerProfile.jsx). The server enforces the same gate independently
// (assertCanCustomizeStore) — this UI gate is a convenience, not the
// security boundary.
function BrandingCard({ plan, branding, onUpdateBranding, saving, onUploadImage, go }) {
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  // Each upload's onUpdateBranding call fills in the OTHER field from
  // `branding` as it stood at the moment this specific upload started —
  // it's a closure over a prop value, never re-read after the await. If
  // both uploads are allowed to run at once (the natural way a seller sets
  // up branding for the first time — logo, then immediately banner, while
  // the logo is still mid-upload), the second one's stale `branding` still
  // shows the first's field as unset, and its onUpdateBranding call
  // overwrites the field the first upload just successfully saved — no
  // error, just a silently vanished logo or banner. Disabling BOTH controls
  // while EITHER is busy (not just each one's own flag) serializes them, so
  // by the time a second upload can start, `branding` has already re-
  // rendered with the first one's result.
  const busy = uploadingLogo || uploadingBanner;
  const locked = !plan || plan.customizationLevel === "none";

  const upload = async (file, kind) => {
    const setUploading = kind === "logo" ? setUploadingLogo : setUploadingBanner;
    setUploading(true);
    try {
      const url = await onUploadImage(file);
      await onUpdateBranding(
        kind === "logo" ? url : branding?.logoUrl ?? null,
        kind === "banner" ? url : branding?.bannerUrl ?? null
      );
    } catch {
      // MainApp already surfaced a toast
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 mb-7 shadow-sm shadow-[#4C1D95]/5">
      <div className="flex items-center gap-2 mb-3">
        <Palette size={14} className="text-[#7C3AED]" />
        <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide">Store branding</p>
      </div>
      {locked ? (
        <div className="flex items-start gap-3 bg-[#F5F2FC] rounded-xl p-3">
          <Lock size={15} className="text-[#7C3AED] shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[12px] text-[#514B67] mb-2">
              Add a store logo and banner on Basic Store and above — they show on your public storefront.
            </p>
            <button onClick={() => go?.("storePlans")} className="text-[11.5px] font-semibold text-[#7C3AED]">
              See upgrade options
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: "logo", label: "Logo", url: branding?.logoUrl, uploading: uploadingLogo, className: "w-16 h-16 rounded-full" },
            { key: "banner", label: "Banner", url: branding?.bannerUrl, uploading: uploadingBanner, className: "w-full h-16 rounded-lg" },
          ].map(({ key, label, url, uploading, className }) => (
            <div key={key}>
              <p className="text-[10.5px] font-medium text-[#8A8372] uppercase tracking-wide mb-1.5">{label}</p>
              <div className={`relative bg-[#F5F2FC] overflow-hidden flex items-center justify-center mb-2 ${className}`}>
                {url ? <NextImage src={url} alt="" fill sizes="120px" className="object-cover" /> : <ImageIcon size={16} className="text-[#B7AFD6]" />}
              </div>
              <label className={`inline-block text-[11px] font-semibold text-[#7C3AED] px-2.5 py-1.5 rounded-lg border border-[#7C3AED]/30 cursor-pointer ${saving || busy ? "opacity-50 pointer-events-none" : ""}`}>
                {uploading ? "Uploading…" : url ? "Change" : "Upload"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={saving || busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) upload(file, key);
                  }}
                />
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const REVENUE_MS = 7 * 24 * 60 * 60 * 1000;

// Real, tiered analytics computed from this seller's own real order data —
// nothing fabricated, nothing shown that a higher plan doesn't actually
// unlock. Free sees the upsell; Basic gets this-month totals; Business/Pro
// add a top product and a real week-by-week trend.
function StoreAnalytics({ plan, orders, go }) {
  const level = plan?.analyticsLevel ?? "none";

  const data = useMemo(() => {
    const now = Date.now();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const thisMonth = orders.filter((o) => new Date(o.createdAt).getTime() >= monthStart);
    const revenueByProduct = new Map();
    for (const o of orders) revenueByProduct.set(o.item, (revenueByProduct.get(o.item) || 0) + o.price);
    const topProduct = [...revenueByProduct.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

    const weeks = [0, 1, 2, 3].map((i) => {
      const end = now - i * REVENUE_MS;
      const start = end - REVENUE_MS;
      const revenue = orders
        .filter((o) => {
          const t = new Date(o.createdAt).getTime();
          return t >= start && t < end;
        })
        .reduce((sum, o) => sum + o.price, 0);
      return revenue;
    }).reverse();

    return {
      monthOrders: thisMonth.length,
      monthRevenue: thisMonth.reduce((sum, o) => sum + o.price, 0),
      avgOrderValue: orders.length ? Math.round(orders.reduce((sum, o) => sum + o.price, 0) / orders.length) : 0,
      topProduct,
      weeks,
    };
  }, [orders]);

  if (level === "none") {
    return (
      <div className="bg-[#F5F2FC] rounded-[20px] p-4 mb-7 flex items-start gap-3">
        <Lock size={15} className="text-[#7C3AED] shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-[#1E1B4B] mb-1">Store analytics</p>
          <p className="text-[11.5px] text-[#6B6483] mb-2">Unlock real sales analytics on Basic Store and above.</p>
          <button onClick={() => go?.("storePlans")} className="text-[11.5px] font-semibold text-[#7C3AED]">
            See upgrade options
          </button>
        </div>
      </div>
    );
  }

  const maxWeek = Math.max(1, ...data.weeks);

  return (
    <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 mb-7 shadow-sm shadow-[#4C1D95]/5">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 size={14} className="text-[#7C3AED]" />
        <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide">Store analytics</p>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-[#F5F2FC] rounded-xl p-3">
          <p className="text-[14px] font-bold text-[#1E1B4B]">{naira(data.monthRevenue)}</p>
          <p className="text-[9.5px] text-[#8A8372] uppercase tracking-wide">This month's revenue</p>
        </div>
        <div className="bg-[#F5F2FC] rounded-xl p-3">
          <p className="text-[14px] font-bold text-[#1E1B4B]">{data.monthOrders}</p>
          <p className="text-[9.5px] text-[#8A8372] uppercase tracking-wide">Orders this month</p>
        </div>
      </div>

      {(level === "advanced" || level === "full") && (
        <div className="flex items-center justify-between bg-[#F5F2FC] rounded-xl p-3 mb-3">
          <div className="min-w-0">
            <p className="text-[9.5px] text-[#8A8372] uppercase tracking-wide mb-0.5">Top product by revenue</p>
            <p className="text-[12.5px] font-semibold text-[#1E1B4B] truncate">{data.topProduct ? data.topProduct[0] : "No sales yet"}</p>
          </div>
          {data.topProduct && <p className="text-[12.5px] font-bold text-[#1E1B4B] shrink-0">{naira(data.topProduct[1])}</p>}
        </div>
      )}

      {level === "full" && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp size={11} className="text-[#7C3AED]" />
            <p className="text-[9.5px] text-[#8A8372] uppercase tracking-wide">Revenue, last 4 weeks</p>
          </div>
          <div className="flex items-end gap-2 h-16">
            {data.weeks.map((rev, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-md"
                  style={{ height: `${Math.max(4, (rev / maxWeek) * 56)}px`, background: "linear-gradient(180deg,#A855F7,#7C3AED)" }}
                  title={naira(rev)}
                />
                <p className="text-[8.5px] text-[#8A8372]">W{i + 1}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[9.5px] text-[#8A8372] mt-2">Average order value: {naira(data.avgOrderValue)}</p>
    </div>
  );
}

// A single review, with a reply box the seller can open once. Self-contained
// so ReviewsCard below stays a plain list — the reply mutation and its
// pending/error state live here, per-row, rather than one shared "which row
// am I editing" id threaded through the parent.
function ReviewRow({ review, onReply }) {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      await onReply(review.id, text);
      setReplying(false);
      setText("");
    } catch {
      // ReviewsCard's reply() already surfaced a toast; keep the box open
      // (and the typed text) so they can retry without losing what they wrote.
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white border border-[#ECE9F7] rounded-[16px] p-3.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} size={12} className={n <= review.rating ? "fill-[#F59E0B] text-[#F59E0B]" : "text-[#E4DFF5]"} />
          ))}
        </span>
        <span className="text-[10.5px] text-[#8A8372]">
          {new Date(review.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
        </span>
      </div>
      {review.comment && <p className="text-[12.5px] text-[#514B67] leading-relaxed mb-2">{review.comment}</p>}

      {review.sellerReply ? (
        <div className="pl-3 border-l-2 border-[#ECE9F7]">
          <p className="text-[10.5px] font-semibold text-[#7C3AED] mb-0.5">Your reply</p>
          <p className="text-[12px] text-[#514B67] leading-relaxed">{review.sellerReply}</p>
        </div>
      ) : replying ? (
        <div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Thank them or address what they said…"
            className="w-full border border-[#ECE9F7] rounded-xl px-3 py-2 text-[12px] outline-none resize-none mb-2"
          />
          <div className="flex gap-2">
            <button
              onClick={send}
              disabled={sending || text.trim().length < 2}
              className={`text-[11.5px] font-semibold text-white px-3.5 py-1.5 rounded-lg ${sending || text.trim().length < 2 ? "opacity-40" : ""}`}
              style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
            >
              {sending ? "Sending…" : "Send reply"}
            </button>
            <button onClick={() => setReplying(false)} disabled={sending} className="text-[11.5px] font-semibold text-[#6B6483] px-3.5 py-1.5">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setReplying(true)} className="text-[11.5px] font-semibold text-[#7C3AED]">
          Reply
        </button>
      )}
    </div>
  );
}

// Reviews previously lived only as two columns on the buyer's own order row
// (my_rating/review_comment) — a seller had no list of what people actually
// wrote and no way to answer any of it. This reads and replies to the real
// lib/reviews.ts table (GET/PATCH /api/sellers/me/reviews). Self-fetching,
// same pattern as SellerDirectory.jsx, since nothing else on this screen
// needs a seller's reviews.
function ReviewsCard({ showToast }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .getMyReviews()
      .then((data) => {
        if (!cancelled) setReviews(data ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const reply = async (reviewId, text) => {
    try {
      const updated = await api.replyToReview(reviewId, text);
      setReviews((rs) => rs.map((r) => (r.id === reviewId ? updated : r)));
    } catch (err) {
      showToast?.(err.message || "Couldn't send your reply — try again.", "error");
      throw err;
    }
  };

  if (loading || reviews.length === 0) return null;

  return (
    <div className="mb-7">
      <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <Star size={13} className="text-[#7C3AED]" /> Reviews
      </p>
      <div className="space-y-3">
        {reviews.map((r) => (
          <ReviewRow key={r.id} review={r} onReply={reply} />
        ))}
      </div>
    </div>
  );
}

// Real backing for getting paid — without this on file, a delivered order's
// payout is recorded 'manual_required' rather than an actual bank transfer
// (see lib/payments.ts#initiateSellerPayout). Account name is always
// resolved from Paystack's own lookup, never typed by the seller, so a
// payout can't silently go to the wrong account.
function PayoutAccountCard({ payoutAccount, banks, onSave, saving }) {
  const [editing, setEditing] = useState(false);
  const [accountNumber, setAccountNumber] = useState("");
  const [bankCode, setBankCode] = useState("");

  const save = async (e) => {
    e.preventDefault();
    try {
      await onSave(accountNumber, bankCode);
      setEditing(false);
      setAccountNumber("");
      setBankCode("");
    } catch {
      // MainApp already surfaced a toast
    }
  };

  return (
    <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 mb-7">
      <div className="flex items-center gap-2 mb-1">
        <Landmark size={15} className="text-[#7C3AED]" />
        <p className="text-[13px] font-semibold text-[#1E1B4B]">Payout account</p>
      </div>

      {!editing && payoutAccount?.hasAccount && (
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-[#514B67]">{payoutAccount.bankAccountName} · {payoutAccount.maskedAccountNumber}</p>
          <button onClick={() => setEditing(true)} className="text-[11.5px] font-semibold text-[#7C3AED]">Change</button>
        </div>
      )}

      {!editing && !payoutAccount?.hasAccount && (
        <div>
          <p className="text-[12px] text-[#6B6483] mb-2.5">
            Add your bank account so FindIt can pay you once a buyer confirms delivery. Without this, a delivered order's payment is held for an admin to settle manually.
          </p>
          <button
            onClick={() => setEditing(true)}
            className="text-[12.5px] font-semibold text-white px-3.5 py-2 rounded-xl"
            style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
          >
            Add payout account
          </button>
        </div>
      )}

      {editing && (
        <form onSubmit={save} className="space-y-2.5 mt-2">
          {banks.length === 0 ? (
            <p className="text-[11.5px] text-[#D97706] bg-[#FDF6EC] border border-[#F5D9A8] rounded-lg px-2.5 py-2">
              Payouts aren't set up in this environment yet (no Paystack keys) — an admin can pay you manually until then.
            </p>
          ) : (
            <>
              <select
                value={bankCode}
                onChange={(e) => setBankCode(e.target.value)}
                required
                className="w-full border border-[#ECE9F7] rounded-lg px-2.5 py-2 text-[12.5px] outline-none"
              >
                <option value="">Select your bank</option>
                {banks.map((b) => (
                  <option key={b.code} value={b.code}>{b.name}</option>
                ))}
              </select>
              <input
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="10-digit account number"
                required
                className="w-full border border-[#ECE9F7] rounded-lg px-2.5 py-2 text-[12.5px] outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving || accountNumber.length !== 10 || !bankCode}
                  className="flex-1 text-white text-[12.5px] font-semibold py-2 rounded-xl disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
                >
                  {saving ? "Verifying…" : "Verify & save"}
                </button>
                <button type="button" onClick={() => setEditing(false)} className="px-3 text-[12.5px] font-semibold text-[#6B6483] border border-[#ECE9F7] rounded-xl">
                  Cancel
                </button>
              </div>
            </>
          )}
        </form>
      )}
    </div>
  );
}

// The five sections a seller actually comes here for, previously all
// stacked in one long scroll with no way to jump between them — "Store
// branding" sat between the revenue chart and "My listings," "Orders to
// fulfill" came after the payout card, and everything for one seller with
// a modest catalog was several screens of scrolling before reaching
// requests. Grouped by what a seller is actually trying to do: check in
// (Overview), manage the catalog (Listings), fulfill what's sold
// (Orders), respond to buyers (Requests), and the one-time/occasional
// setup (Store — branding, payout account, reviews).
const TABS = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "listings", label: "Listings", icon: Package },
  { key: "orders", label: "Orders", icon: ClipboardList },
  { key: "requests", label: "Requests", icon: Send },
  { key: "store", label: "Store", icon: Store },
];

function TabBar({ active, onChange, counts }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 mb-6 -mx-5 px-5" style={{ scrollbarWidth: "none" }}>
      {TABS.map(({ key, label, icon: Icon }) => {
        const isActive = active === key;
        const count = counts[key];
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`shrink-0 flex items-center gap-1.5 text-[12.5px] font-semibold px-3.5 py-2 rounded-full border transition ${
              isActive ? "text-white border-transparent" : "bg-white text-[#514B67] border-[#ECE9F7]"
            }`}
            style={isActive ? { background: "linear-gradient(135deg,#A855F7,#7C3AED)" } : {}}
          >
            <Icon size={13} /> {label}
            {count > 0 && (
              <span
                className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-full ${
                  isActive ? "bg-white/25 text-white" : "bg-[#F5F2FC] text-[#7C3AED]"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function SellerDashboard({
  requests, onSendOffer, user, mySellerId, orders, onAdvanceOrderStatus,
  products, onCreateProduct, onUpdateProduct, onDeleteProduct, onUploadImage,
  onMessageBuyer,
  myLocation,
  showToast,
  storePlan, go,
  storeBranding, onUpdateBranding, savingBranding,
  verification,
  payoutAccount, banks = [], onSavePayoutAccount, savingPayoutAccount,
  boostPlans = [], onBoostProduct,
  myStore, onClaimStore, claimingStore,
  transactionRecords = [],
}) {
  const [offeringId, setOfferingId] = useState(null);
  const [sendingOffer, setSendingOffer] = useState(false);
  const [advancingId, setAdvancingId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [savingListing, setSavingListing] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [messagingId, setMessagingId] = useState(null);
  const [boostPickerId, setBoostPickerId] = useState(null);
  const [boostingId, setBoostingId] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [storeLinkCopied, setStoreLinkCopied] = useState(false);

  const boostListing = async (productId, boostPlanId) => {
    setBoostingId(productId);
    try {
      await onBoostProduct(productId, boostPlanId);
      setBoostPickerId(null);
    } finally {
      setBoostingId(null);
    }
  };

  const messageBuyer = async (order) => {
    setMessagingId(order.id);
    try {
      await onMessageBuyer(order);
    } catch {
      // MainApp already surfaced a toast
    } finally {
      setMessagingId(null);
    }
  };

  // sellerId-first, business_name only as the fallback for a legacy row that
  // predates the seller_id backfill (migration 009) and so has none — the
  // same union lib/repo.ts#listOrders already does server-side. Plain name
  // matching alone (the old code) would also catch a same-named stranger's
  // listings here — business_name has no uniqueness constraint — and, for
  // orders specifically, this account's OWN purchases from that stranger too
  // (orders already includes this user's own buyer-side orders, and one of
  // those could carry `seller === user.businessName` purely by the name
  // collision, with nothing to do with this account's own sales).
  //
  // While mySellerId hasn't loaded yet (its own fetch, racing products'/
  // orders' own fetches on every mount — see MainApp.jsx), falling straight
  // to the sellerId branch would show NOTHING for a seller whose rows all
  // carry a real seller_id, until that fetch resolves — a listings/orders
  // section that visibly empties out and refills on every page load. Until
  // it's known, matching by name alone (the old behaviour) is the safer
  // default: it can't under-count, only (rarely) over-count under an actual
  // name collision, and only for that brief window.
  const isMine = (row) =>
    mySellerId != null
      ? row.sellerId === mySellerId || (row.sellerId == null && row.seller === user.businessName)
      : row.seller === user.businessName;
  const myOrders = orders.filter(isMine);
  const myListings = products.filter(isMine);
  const plan = storePlan?.plan ?? null;
  // Active-listing count derived live from myListings — the same list
  // rendered below — rather than storePlan.usage.activeProducts, a
  // separately-fetched snapshot that goes stale the moment a listing is
  // added or deleted (neither handleCreateProduct nor handleDeleteProduct
  // in MainApp.jsx refetches storePlan). That staleness used to leave this
  // gate and the usage label out of sync with the actual list until some
  // unrelated action (e.g. a plan change) happened to refresh storePlan.
  const activeListingCount = myListings.filter((p) => p.active !== false).length;
  const atListingLimit = plan && plan.productLimit !== null && activeListingCount >= plan.productLimit;
  const usageLabel = plan
    ? plan.productLimit === null
      ? `${activeListingCount} product${activeListingCount === 1 ? "" : "s"}`
      : `${activeListingCount} / ${plan.productLimit} products used`
    : null;

  const reviewedOrders = myOrders.filter((o) => o.reviewed && o.myRating != null);
  const avgRating = reviewedOrders.length
    ? (reviewedOrders.reduce((sum, o) => sum + o.myRating, 0) / reviewedOrders.length).toFixed(1)
    : null;
  const orderValue = myOrders.reduce((sum, o) => sum + o.price, 0);
  const STATS = [
    ["Rating", avgRating ?? "—"],
    ["Orders", String(myOrders.length)],
    ["Listings", String(myListings.length)],
    ["Order value", naira(orderValue)],
  ];

  const sendOffer = async (requestId, form) => {
    setSendingOffer(true);
    try {
      await onSendOffer(requestId, {
        price: Number(form.price),
        delivery: form.delivery.trim(),
        eta: form.eta.trim(),
        warranty: form.warranty.trim(),
        note: form.note.trim() || null,
      });
      setOfferingId(null);
    } finally {
      setSendingOffer(false);
    }
  };

  const advance = async (order) => {
    const nextStatus = nextSellerStep(order.status);
    if (!nextStatus) return;
    setAdvancingId(order.id);
    try {
      await onAdvanceOrderStatus(order.id, nextStatus);
    } finally {
      setAdvancingId(null);
    }
  };

  const listingPayload = (form) => ({
    name: form.name,
    category: form.category,
    price: Number(form.price),
    images: form.images,
    description: form.description.trim() || null,
    condition: form.condition,
    qty: form.qty === "" ? undefined : Number(form.qty),
    location: form.location.trim() || null,
    deliveryOption: form.deliveryOption,
    color: form.color.trim() || null,
    variation: form.variation.trim() || null,
  });

  const saveNew = async (form) => {
    setSavingListing(true);
    try {
      await onCreateProduct(listingPayload(form));
      setAdding(false);
    } finally {
      setSavingListing(false);
    }
  };

  const saveEdit = async (id, form) => {
    setSavingListing(true);
    try {
      await onUpdateProduct(id, listingPayload(form));
      setEditingId(null);
    } finally {
      setSavingListing(false);
    }
  };

  const remove = async (id) => {
    setDeletingId(id);
    try {
      await onDeleteProduct(id);
    } finally {
      setDeletingId(null);
    }
  };

  // Real distance from the seller's own location to each open request —
  // sorted nearest-first when we have it, otherwise left in the API's
  // default (most-recent-first) order.
  const sortedRequests = useMemo(() => {
    if (!myLocation) return requests;
    return [...requests]
      .map((r) => ({ ...r, _km: r.lat != null && r.lng != null ? haversineKm(myLocation.lat, myLocation.lng, r.lat, r.lng) : Infinity }))
      .sort((a, b) => a._km - b._km);
  }, [requests, myLocation]);

  return (
    <div className="px-5 pt-6 pb-10">
      <div className="flex items-center gap-2 mb-1">
        <LayoutDashboard size={17} className="text-[#7C3AED]" />
        <h1 className="text-[19px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>Seller dashboard</h1>
      </div>
      <p className="text-[12px] text-[#6B6483] mb-5 flex items-center gap-1.5">
        {user.businessName}
        {plan?.proBadge && (
          <span className="flex items-center gap-1 text-[9.5px] font-bold text-white px-1.5 py-0.5 rounded-full" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}>
            <Crown size={9} /> PRO STORE
          </span>
        )}
      </p>

      <TabBar
        active={activeTab}
        onChange={setActiveTab}
        counts={{ listings: myListings.length, orders: myOrders.length, requests: requests.length }}
      />

      {activeTab === "overview" && (
      <>
      {plan && (
        <button
          onClick={() => go?.("storePlans")}
          className="w-full flex items-center justify-between gap-3 bg-white border border-[#ECE9F7] rounded-[20px] p-4 mb-4 shadow-sm shadow-[#4C1D95]/5 text-left"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[#F5F2FC] flex items-center justify-center shrink-0">
              <Crown size={16} className="text-[#7C3AED]" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[#1E1B4B]">{plan.name} plan</p>
              <p className="text-[11px] text-[#6B6483]">
                {usageLabel}
                {storePlan.subscription.status === "trialing" && " · Trial"}
              </p>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-[#7C3AED] shrink-0">Manage</span>
        </button>
      )}

      {/* The seller's dedicated public storefront. Eligibility is decided
          server-side from the live subscription (lib/store.ts); this card
          only reflects the answer it already gave. */}
      {myStore && (
        <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 mb-4 shadow-sm shadow-[#4C1D95]/5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-full bg-[#F5F2FC] flex items-center justify-center shrink-0">
              <LinkIcon size={15} className="text-[#7C3AED]" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[#1E1B4B]">Your store link</p>
              <p className="text-[11px] text-[#6B6483]">
                {myStore.slug
                  ? myStore.claimedButUnavailable
                    ? "Saved for you \u2014 reopens when your plan is active again"
                    : "Share this anywhere"
                  : myStore.eligible
                    ? "Claim your own shareable store page"
                    : myStore.reason}
              </p>
            </div>
          </div>

          {myStore.slug ? (
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-[11.5px] text-[#1E1B4B] bg-[#F7F5FD] border border-[#ECE9F7] rounded-lg px-2.5 py-1.5 break-all">
                {myStore.url}
              </code>
              <div className="flex items-center gap-1 ml-auto">
                {!myStore.claimedButUnavailable && (
                  <a
                    href={`/store/${myStore.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11.5px] font-semibold text-[#7C3AED] px-2.5 py-1.5"
                  >
                    Visit
                  </a>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(myStore.url);
                      setStoreLinkCopied(true);
                      setTimeout(() => setStoreLinkCopied(false), 1500);
                    } catch {
                      // Clipboard permission denied or unavailable — nothing to recover.
                    }
                  }}
                  className="flex items-center gap-1 text-[11.5px] font-semibold text-[#7C3AED] px-2.5 py-1.5"
                >
                  {storeLinkCopied ? <Check size={13} /> : <Copy size={13} />}
                  {storeLinkCopied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          ) : myStore.eligible ? (
            <button
              onClick={onClaimStore}
              disabled={claimingStore}
              className="text-[12px] font-semibold text-white px-4 py-2 rounded-full disabled:opacity-60"
              style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
            >
              {claimingStore ? "Creating\u2026" : "Create my store link"}
            </button>
          ) : (
            <button
              onClick={() => go?.("storePlans")}
              className="text-[12px] font-semibold text-[#7C3AED]"
            >
              See Store plans
            </button>
          )}
        </div>
      )}

      {verification && verification.status !== "approved" && (
        <button
          onClick={() => go?.("sellerOnboarding")}
          className="w-full flex items-center justify-between gap-3 bg-white border border-[#ECE9F7] rounded-[20px] p-4 mb-4 shadow-sm shadow-[#4C1D95]/5 text-left"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[#F5F2FC] flex items-center justify-center shrink-0">
              {verification.status === "rejected" || verification.status === "needs_info" ? (
                <ShieldAlert size={16} className="text-[#C22468]" />
              ) : (
                <ShieldCheck size={16} className="text-[#7C3AED]" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[#1E1B4B]">
                {{
                  incomplete: "Complete your seller verification",
                  pending: "Verification under review",
                  needs_info: "FindIt needs more information",
                  rejected: "Verification wasn't approved",
                }[verification.status]}
              </p>
              <p className="text-[11px] text-[#6B6483]">
                {verification.status === "incomplete"
                  ? "Get the Verified badge on your storefront"
                  : verification.status === "pending"
                    ? "We'll notify you once it's reviewed"
                    : "Tap to review and resubmit"}
              </p>
            </div>
          </div>
          {verification.status === "incomplete" && <span className="text-[11px] font-semibold text-[#7C3AED] shrink-0">Start</span>}
        </button>
      )}

      <div className="grid grid-cols-4 gap-2 mb-6">
        {STATS.map(([l, v]) => (
          <div key={l} className="bg-white border border-[#ECE9F7] rounded-[20px] py-3 text-center shadow-sm shadow-[#4C1D95]/5">
            <p className="text-[14px] font-bold text-[#1E1B4B]">{v}</p>
            <p className="text-[9.5px] text-[#8A8372] uppercase tracking-wide">{l}</p>
          </div>
        ))}
      </div>

      <StoreAnalytics plan={plan} orders={myOrders} go={go} />
      </>
      )}

      {activeTab === "listings" && (
      <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide">My listings</p>
        {!adding && !atListingLimit && (
          <motion.button onClick={() => setAdding(true)} {...press} className="flex items-center gap-1 text-[11px] font-semibold text-[#7C3AED]">
            <Plus size={13} /> Add listing
          </motion.button>
        )}
      </div>
      <div className="space-y-3 mb-7">
        <AnimatePresence initial={false}>
          {atListingLimit && !adding && (
            <motion.div
              key="limit-upsell"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: DURATION.fast, ease: EASE }}
              className="bg-[#F5F2FC] rounded-[20px] p-4"
            >
              <p className="text-[12.5px] font-semibold text-[#1E1B4B] mb-1">
                You&apos;ve reached the {plan.name} plan&apos;s limit of {plan.productLimit} active products.
              </p>
              <p className="text-[11px] text-[#6B6483] mb-3">Upgrade for more room to list — your existing listings are safe either way.</p>
              <motion.button
                onClick={() => go?.("storePlans")}
                {...press}
                className="text-white text-[11.5px] font-semibold px-3.5 py-2 rounded-xl"
                style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
              >
                See upgrade options
              </motion.button>
            </motion.div>
          )}
          {adding && (
            <motion.div
              key="add-form"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: DURATION.fast, ease: EASE }}
              className="bg-white border border-[#ECE9F7] rounded-[20px] p-3 shadow-sm shadow-[#4C1D95]/5"
            >
              <ListingForm initial={EMPTY_FORM} onSave={saveNew} onCancel={() => setAdding(false)} saving={savingListing} onUploadImage={onUploadImage} />
            </motion.div>
          )}
        </AnimatePresence>
        {myListings.length === 0 && !adding && (
          <p className="text-[12px] text-[#6B6483]">No listings yet — add your first product above.</p>
        )}
        {myListings.map((p) => (
          <div key={p.id} className={`bg-white border border-[#ECE9F7] rounded-[20px] p-3 shadow-sm shadow-[#4C1D95]/5 ${p.active === false || p.moderationStatus === "removed" ? "opacity-60" : ""}`}>
            {editingId === p.id ? (
              <ListingForm
                initial={{
                  name: p.name,
                  category: p.category,
                  price: String(p.price),
                  images: p.images ?? (p.imageUrl ? [p.imageUrl] : []),
                  description: p.description ?? "",
                  condition: p.condition ?? "New",
                  qty: String(p.qty ?? 1),
                  location: p.location ?? "",
                  deliveryOption: p.deliveryOption ?? "Delivery",
                  color: p.color ?? "",
                  variation: p.variation ?? "",
                }}
                onSave={(form) => saveEdit(p.id, form)}
                onCancel={() => setEditingId(null)}
                saving={savingListing}
                onUploadImage={onUploadImage}
              />
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 p-1">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[13px] font-semibold text-[#1E1B4B] truncate">{p.name}</p>
                      {p.active === false && (
                        <span className="flex items-center gap-1 text-[9.5px] font-semibold text-[#B45309] bg-[#F59E0B]/12 px-1.5 py-0.5 rounded-full shrink-0">
                          <EyeOff size={9} /> Hidden — over plan limit
                        </span>
                      )}
                      {p.moderationStatus === "under_review" && (
                        <span className="flex items-center gap-1 text-[9.5px] font-semibold text-[#B45309] bg-[#F59E0B]/12 px-1.5 py-0.5 rounded-full shrink-0">
                          <ShieldAlert size={9} /> Needs review
                        </span>
                      )}
                      {p.moderationStatus === "removed" && (
                        <span className="flex items-center gap-1 text-[9.5px] font-semibold text-[#C22468] bg-[#E64980]/10 px-1.5 py-0.5 rounded-full shrink-0">
                          <X size={9} /> Rejected{p.moderationReason ? `: ${p.moderationReason}` : ""}
                        </span>
                      )}
                      {p.boostedUntil && new Date(p.boostedUntil).getTime() > Date.now() && (
                        <span className="flex items-center gap-1 text-[9.5px] font-semibold text-white px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}>
                          <TrendingUp size={9} /> Boosted until {new Date(p.boostedUntil).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#6B6483]">{GROUPS[p.category]?.label} · {naira(p.price)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {p.active !== false && p.moderationStatus !== "removed" && (
                      <motion.button
                        onClick={() => setBoostPickerId(boostPickerId === p.id ? null : p.id)}
                        aria-label={`Boost ${p.name}`}
                        aria-expanded={boostPickerId === p.id}
                        {...press}
                        className="w-8 h-8 rounded-lg bg-[#F5F2FC] flex items-center justify-center"
                      >
                        <TrendingUp size={13} className="text-[#7C3AED]" />
                      </motion.button>
                    )}
                    <motion.button onClick={() => setEditingId(p.id)} aria-label={`Edit ${p.name}`} {...press} className="w-8 h-8 rounded-lg bg-[#F5F2FC] flex items-center justify-center">
                      <Pencil size={13} className="text-[#7C3AED]" />
                    </motion.button>
                    <motion.button
                      onClick={() => remove(p.id)}
                      disabled={deletingId !== null}
                      aria-label={`Delete ${p.name}`}
                      {...press}
                      className="w-8 h-8 rounded-lg bg-[#FDF0F4] flex items-center justify-center disabled:opacity-50"
                    >
                      <Trash2 size={13} className="text-[#E64980]" />
                    </motion.button>
                  </div>
                </div>
                <AnimatePresence initial={false}>
                  {boostPickerId === p.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: DURATION.fast, ease: EASE }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 pt-2.5 border-t border-[#ECE9F7] px-1">
                        <p className="text-[11px] text-[#6B6483] mb-2">Pay to move this listing to the front of Home & Browse:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {boostPlans.length === 0 && <p className="text-[11px] text-[#8A8372]">Boosting isn&apos;t available right now.</p>}
                          {boostPlans.map((bp) => (
                            <motion.button
                              key={bp.id}
                              onClick={() => boostListing(p.id, bp.id)}
                              disabled={boostingId !== null}
                              {...press}
                              className="text-[11.5px] font-semibold text-white px-3 py-1.5 rounded-lg disabled:opacity-60"
                              style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
                            >
                              {boostingId === p.id ? "Working…" : `${bp.durationDays}d — ${naira(bp.price)}`}
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>
        ))}
      </div>
      </>
      )}

      {activeTab === "store" && (
      <>
      <ReviewsCard showToast={showToast} />
      <BrandingCard plan={plan} branding={storeBranding} onUpdateBranding={onUpdateBranding} saving={savingBranding} onUploadImage={onUploadImage} go={go} />
      <PayoutAccountCard
        payoutAccount={payoutAccount}
        banks={banks}
        onSave={onSavePayoutAccount}
        saving={savingPayoutAccount}
      />
      </>
      )}

      {activeTab === "orders" && (
      <>
      <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3">Orders to fulfill</p>
      <motion.div className="space-y-3 mb-7" initial="hidden" animate="visible" variants={STAGGER_CONTAINER}>
        {myOrders.length === 0 && (
          <p className="text-[12px] text-[#6B6483]">No orders under your business name yet.</p>
        )}
        <AnimatePresence initial={false}>
        {myOrders.map((o) => {
          const nextStatus = nextSellerStep(o.status);
          const awaitingBuyer = !nextStatus && o.status !== "Delivered";
          return (
            <motion.div key={o.id} layout="position" variants={STAGGER_ITEM} className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 shadow-sm shadow-[#4C1D95]/5">
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Package size={13} className="text-[#7C3AED] shrink-0" />
                  <p className="text-[13px] font-semibold text-[#1E1B4B]">{o.item}</p>
                </div>
                {/* Crossfade instead of an instant swap when the seller's own
                    "Mark as…" action (or a buyer/system change) moves the
                    order to its next status. */}
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={o.status}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: DURATION.fast, ease: EASE }}
                  >
                    <Pill tone={statusTone(o.status)}>{o.status}</Pill>
                  </motion.span>
                </AnimatePresence>
              </div>
              <p className="text-[11px] text-[#6B6483] mb-3">{o.id} · {naira(o.price)}</p>
              {/* The verified record for this sale, once it exists. Only
                  rendered when the server actually created one — never
                  inferred from the order's own status. */}
              {(() => {
                const record = transactionRecords.find((r) => r.orderId === o.id);
                if (!record) return null;
                const refunded = record.status === "refunded";
                return (
                  <div className="flex items-center gap-2 flex-wrap mb-2.5">
                    <span className={`text-[11px] font-semibold ${refunded ? "text-[#B45309]" : "text-[#15803D]"}`}>
                      {refunded ? "\u26a0 Refunded" : "\u2713 Completed"}
                    </span>
                    <span className="text-[11px] text-[#6B6483] font-mono">{record.code}</span>
                    <a
                      href={`/verify/${record.code}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-semibold text-[#7C3AED]"
                    >
                      View record
                    </a>
                  </div>
                );
              })()}
              <motion.button
                onClick={() => messageBuyer(o)}
                disabled={messagingId !== null}
                {...press}
                className={`flex items-center gap-1.5 text-[12px] font-semibold text-[#7C3AED] mb-2.5 ${messagingId !== null ? "opacity-60" : ""}`}
              >
                <MessageCircle size={13} /> {messagingId === o.id ? "Opening…" : "Message buyer"}
              </motion.button>
              {/* The fulfillment action itself crossfades between states
                  (waiting on payment → "Mark as…" → waiting on the buyer →
                  settled) instead of cutting instantly when an order moves. */}
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={o.paymentStatus !== "paid" ? "unpaid" : nextStatus ? `next:${nextStatus}` : awaitingBuyer ? "awaiting" : o.escrowStatus === "refunded" ? "refunded" : "delivered"}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: DURATION.fast, ease: EASE }}
                >
                  {o.paymentStatus !== "paid" ? (
                    <Pill tone="stone"><Clock size={11} /> Waiting for the buyer to pay</Pill>
                  ) : nextStatus ? (
                    <motion.button
                      onClick={() => advance(o)}
                      disabled={advancingId !== null}
                      {...press}
                      className={`flex items-center gap-1.5 text-white text-[12px] font-semibold px-3.5 py-2 rounded-xl ${advancingId !== null ? "opacity-60" : ""}`}
                      style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
                    >
                      {advancingId === o.id ? "Updating…" : <>Mark as {nextStatus} <ArrowRight size={12} /></>}
                    </motion.button>
                  ) : awaitingBuyer ? (
                    <div>
                      <Pill tone="gold"><Clock size={11} /> Waiting for buyer to confirm</Pill>
                      <p className="text-[11px] text-[#6B6483] mt-2">
                        {o.escrowStatus === "disputed"
                          ? "The buyer reported a problem — FindIt is reviewing it before releasing your payment."
                          : "Your payment is released as soon as the buyer confirms the order arrived."}
                      </p>
                    </div>
                  ) : o.escrowStatus === "refunded" ? (
                    <Pill tone="stone">Refunded to buyer</Pill>
                  ) : (
                    <div>
                      <Pill tone="green"><CheckCircle2 size={11} /> Delivered — payment released</Pill>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          );
        })}
        </AnimatePresence>
      </motion.div>
      </>
      )}

      {activeTab === "requests" && (
      <>
      <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3">Matching customer requests</p>
      <div className="space-y-3">
        {requests.length === 0 && (
          <p className="text-[12px] text-[#6B6483]">No open requests right now.</p>
        )}
        {sortedRequests.map((r) => (
          <div key={r.id} className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 shadow-sm shadow-[#4C1D95]/5">
            <div className="flex items-start justify-between mb-1">
              <p className="text-[13px] font-semibold text-[#1E1B4B] pr-2">{r.title}</p>
              <span className="text-[10px] text-[#8A8372] whitespace-nowrap">{r.posted}</span>
            </div>
            <p className="text-[11px] text-[#6B6483] mb-3 flex items-center gap-2 flex-wrap">
              <span>{r.customerName || "A buyer"} · Budget {budgetLabel(r)}</span>
              {Number.isFinite(r._km) && (
                <span className="flex items-center gap-0.5 text-[#7C3AED] font-medium"><MapPin size={10} /> {formatDistanceKm(r._km)}</span>
              )}
            </p>
            {/* myOfferSent — whether THIS seller specifically already sent
                an offer — not offerCount, which is every seller's offers
                combined. Gating on offerCount used to hide "Send offer"
                the moment ANY other seller responded, even for a seller
                who'd never touched this request themselves. */}
            {r.myOfferSent ? (
              <Pill tone="green"><CheckCircle2 size={11} /> Offer sent</Pill>
            ) : offeringId === r.id ? (
              <OfferForm onSend={(form) => sendOffer(r.id, form)} onCancel={() => setOfferingId(null)} sending={sendingOffer} />
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setOfferingId(r.id)}
                  className="flex items-center gap-1.5 text-white text-[12px] font-semibold px-3.5 py-2 rounded-xl"
                  style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
                >
                  <Send size={12} /> Send offer
                </button>
                {r.offerCount > 0 && (
                  <span className="text-[10.5px] text-[#8A8372]">
                    {r.offerCount} other offer{r.offerCount === 1 ? "" : "s"} sent — still open
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      </>
      )}
    </div>
  );
}
