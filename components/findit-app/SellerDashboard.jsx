"use client";

import { useState } from "react";
import { CheckCircle2, Send, LayoutDashboard, Package, ArrowRight, Plus, Pencil, Trash2, Image as ImageIcon } from "lucide-react";
import { naira, STEPS, GROUPS } from "./data";
import { Pill, Field } from "./shared";

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

const EMPTY_FORM = { name: "", category: Object.keys(GROUPS)[0], price: "", imageUrl: null };

function ListingForm({ initial, onSave, onCancel, saving, onUploadImage }) {
  const [form, setForm] = useState(initial);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const url = await onUploadImage(file);
      setForm((f) => ({ ...f, imageUrl: url }));
    } catch {
      // onUploadImage already surfaces a toast on failure
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-[#F5F2FC] rounded-xl p-3 mt-2 space-y-2.5">
      <Field label="Photo">
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-lg overflow-hidden bg-white border border-[#ECE9F7] flex items-center justify-center shrink-0">
            {form.imageUrl ? (
              <img src={form.imageUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon size={18} className="text-[#B7AFD6]" />
            )}
          </div>
          <label className={`text-[11.5px] font-semibold text-[#7C3AED] px-3 py-2 rounded-lg border border-[#7C3AED]/30 bg-white cursor-pointer ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
            {uploading ? "Uploading…" : form.imageUrl ? "Change photo" : "Add photo"}
            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={uploading} />
          </label>
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
      <Field label="Price (₦)">
        <input
          type="number"
          min={1}
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
          className="w-full bg-white border border-[#ECE9F7] rounded-lg px-3 py-2 text-[12.5px] outline-none"
        />
      </Field>
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onSave(form)}
          disabled={saving || uploading || !form.name.trim() || !Number(form.price)}
          className={`flex-1 text-white text-[12px] font-semibold py-2 rounded-lg ${saving || uploading || !form.name.trim() || !Number(form.price) ? "opacity-50" : ""}`}
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

export default function SellerDashboard({
  requests, onSendOffer, user, orders, onAdvanceOrderStatus,
  products, onCreateProduct, onUpdateProduct, onDeleteProduct, onUploadImage,
}) {
  const [offeringId, setOfferingId] = useState(null);
  const [sendingOffer, setSendingOffer] = useState(false);
  const [advancingId, setAdvancingId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [savingListing, setSavingListing] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const myOrders = orders.filter((o) => o.seller === user.businessName);
  const myListings = products.filter((p) => p.seller === user.businessName);

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
    const nextIdx = STEPS.indexOf(order.status) + 1;
    const nextStatus = STEPS[nextIdx];
    if (!nextStatus) return;
    setAdvancingId(order.id);
    try {
      await onAdvanceOrderStatus(order.id, nextStatus);
    } finally {
      setAdvancingId(null);
    }
  };

  const saveNew = async (form) => {
    setSavingListing(true);
    try {
      await onCreateProduct({ name: form.name, category: form.category, price: Number(form.price), imageUrl: form.imageUrl });
      setAdding(false);
    } finally {
      setSavingListing(false);
    }
  };

  const saveEdit = async (id, form) => {
    setSavingListing(true);
    try {
      await onUpdateProduct(id, { name: form.name, category: form.category, price: Number(form.price), imageUrl: form.imageUrl });
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

  return (
    <div className="px-5 pt-6 pb-10">
      <div className="flex items-center gap-2 mb-1">
        <LayoutDashboard size={17} className="text-[#7C3AED]" />
        <h1 className="text-[19px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>Seller dashboard</h1>
      </div>
      <p className="text-[12px] text-[#6B6483] mb-5">{user.businessName}</p>

      <div className="grid grid-cols-4 gap-2 mb-6">
        {STATS.map(([l, v]) => (
          <div key={l} className="bg-white border border-[#ECE9F7] rounded-[20px] py-3 text-center shadow-sm shadow-[#4C1D95]/5">
            <p className="text-[14px] font-bold text-[#1E1B4B]">{v}</p>
            <p className="text-[9.5px] text-[#8A8372] uppercase tracking-wide">{l}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide">My listings</p>
        {!adding && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-[11px] font-semibold text-[#7C3AED]">
            <Plus size={13} /> Add listing
          </button>
        )}
      </div>
      <div className="space-y-3 mb-7">
        {adding && (
          <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-3 shadow-sm shadow-[#4C1D95]/5">
            <ListingForm initial={EMPTY_FORM} onSave={saveNew} onCancel={() => setAdding(false)} saving={savingListing} onUploadImage={onUploadImage} />
          </div>
        )}
        {myListings.length === 0 && !adding && (
          <p className="text-[12px] text-[#6B6483]">No listings yet — add your first product above.</p>
        )}
        {myListings.map((p) => (
          <div key={p.id} className="bg-white border border-[#ECE9F7] rounded-[20px] p-3 shadow-sm shadow-[#4C1D95]/5">
            {editingId === p.id ? (
              <ListingForm
                initial={{ name: p.name, category: p.category, price: String(p.price), imageUrl: p.imageUrl || null }}
                onSave={(form) => saveEdit(p.id, form)}
                onCancel={() => setEditingId(null)}
                saving={savingListing}
                onUploadImage={onUploadImage}
              />
            ) : (
              <div className="flex items-center justify-between gap-2 p-1">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[#1E1B4B] truncate">{p.name}</p>
                  <p className="text-[11px] text-[#6B6483]">{GROUPS[p.category]?.label} · {naira(p.price)}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => setEditingId(p.id)} className="w-8 h-8 rounded-lg bg-[#F5F2FC] flex items-center justify-center">
                    <Pencil size={13} className="text-[#7C3AED]" />
                  </button>
                  <button
                    onClick={() => remove(p.id)}
                    disabled={deletingId !== null}
                    className="w-8 h-8 rounded-lg bg-[#FDF0F4] flex items-center justify-center disabled:opacity-50"
                  >
                    <Trash2 size={13} className="text-[#E64980]" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3">Orders to fulfill</p>
      <div className="space-y-3 mb-7">
        {myOrders.length === 0 && (
          <p className="text-[12px] text-[#6B6483]">No orders under your business name yet.</p>
        )}
        {myOrders.map((o) => {
          const nextStatus = STEPS[STEPS.indexOf(o.status) + 1];
          return (
            <div key={o.id} className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 shadow-sm shadow-[#4C1D95]/5">
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Package size={13} className="text-[#7C3AED] shrink-0" />
                  <p className="text-[13px] font-semibold text-[#1E1B4B]">{o.item}</p>
                </div>
                <Pill tone={statusTone(o.status)}>{o.status}</Pill>
              </div>
              <p className="text-[11px] text-[#6B6483] mb-3">{o.id} · {naira(o.price)}</p>
              {nextStatus ? (
                <button
                  onClick={() => advance(o)}
                  disabled={advancingId !== null}
                  className={`flex items-center gap-1.5 text-white text-[12px] font-semibold px-3.5 py-2 rounded-xl ${advancingId !== null ? "opacity-60" : ""}`}
                  style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
                >
                  {advancingId === o.id ? "Updating…" : <>Mark as {nextStatus} <ArrowRight size={12} /></>}
                </button>
              ) : (
                <Pill tone="green"><CheckCircle2 size={11} /> Fulfilled</Pill>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3">Matching customer requests</p>
      <div className="space-y-3">
        {requests.length === 0 && (
          <p className="text-[12px] text-[#6B6483]">No open requests right now.</p>
        )}
        {requests.map((r) => (
          <div key={r.id} className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 shadow-sm shadow-[#4C1D95]/5">
            <div className="flex items-start justify-between mb-1">
              <p className="text-[13px] font-semibold text-[#1E1B4B] pr-2">{r.title}</p>
              <span className="text-[10px] text-[#8A8372] whitespace-nowrap">{r.posted}</span>
            </div>
            <p className="text-[11px] text-[#6B6483] mb-3">
              {r.customerName || "A buyer"} · Budget {budgetLabel(r)}
            </p>
            {r.offerCount > 0 ? (
              <Pill tone="green"><CheckCircle2 size={11} /> Offer sent</Pill>
            ) : offeringId === r.id ? (
              <OfferForm onSend={(form) => sendOffer(r.id, form)} onCancel={() => setOfferingId(null)} sending={sendingOffer} />
            ) : (
              <button
                onClick={() => setOfferingId(r.id)}
                className="flex items-center gap-1.5 text-white text-[12px] font-semibold px-3.5 py-2 rounded-xl"
                style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
              >
                <Send size={12} /> Send offer
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
