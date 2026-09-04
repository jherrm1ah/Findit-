"use client";

import { useState } from "react";
import { CheckCircle2, Send, LayoutDashboard, Package, ArrowRight, Plus, Pencil, Trash2 } from "lucide-react";
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

const EMPTY_FORM = { name: "", category: Object.keys(GROUPS)[0], price: "" };

function ListingForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="bg-[#F5F2FC] rounded-xl p-3 mt-2 space-y-2.5">
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
          disabled={saving || !form.name.trim() || !Number(form.price)}
          className={`flex-1 text-white text-[12px] font-semibold py-2 rounded-lg ${saving || !form.name.trim() || !Number(form.price) ? "opacity-50" : ""}`}
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
  products, onCreateProduct, onUpdateProduct, onDeleteProduct,
}) {
  const [sendingId, setSendingId] = useState(null);
  const [advancingId, setAdvancingId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [savingListing, setSavingListing] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const myOrders = orders.filter((o) => o.seller === user.businessName);
  const myListings = products.filter((p) => p.seller === user.businessName);

  const send = async (id) => {
    setSendingId(id);
    try {
      await onSendOffer(id);
    } finally {
      setSendingId(null);
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
      await onCreateProduct({ name: form.name, category: form.category, price: Number(form.price) });
      setAdding(false);
    } finally {
      setSavingListing(false);
    }
  };

  const saveEdit = async (id, form) => {
    setSavingListing(true);
    try {
      await onUpdateProduct(id, { name: form.name, category: form.category, price: Number(form.price) });
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
        {[["Rating", "4.9"], ["Orders", "212"], ["Response", "98%"], ["Payout", "₦186k"]].map(([l, v]) => (
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
            <ListingForm initial={EMPTY_FORM} onSave={saveNew} onCancel={() => setAdding(false)} saving={savingListing} />
          </div>
        )}
        {myListings.length === 0 && !adding && (
          <p className="text-[12px] text-[#6B6483]">No listings yet — add your first product above.</p>
        )}
        {myListings.map((p) => (
          <div key={p.id} className="bg-white border border-[#ECE9F7] rounded-[20px] p-3 shadow-sm shadow-[#4C1D95]/5">
            {editingId === p.id ? (
              <ListingForm
                initial={{ name: p.name, category: p.category, price: String(p.price) }}
                onSave={(form) => saveEdit(p.id, form)}
                onCancel={() => setEditingId(null)}
                saving={savingListing}
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
              {r.customer || "Customer"} · Budget {budgetLabel(r)}
            </p>
            {r.offerCount > 0 ? (
              <Pill tone="green"><CheckCircle2 size={11} /> Offer sent</Pill>
            ) : (
              <button
                onClick={() => send(r.id)}
                disabled={sendingId !== null}
                className={`flex items-center gap-1.5 text-white text-[12px] font-semibold px-3.5 py-2 rounded-xl ${sendingId !== null ? "opacity-60" : ""}`}
                style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
              >
                <Send size={12} /> {sendingId === r.id ? "Sending…" : "Send offer"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
