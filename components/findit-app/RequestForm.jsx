"use client";

import { useEffect, useRef, useState } from "react";
import {
  Search, CheckCircle2, ArrowRight, Camera, Mic, Link2, Star, BadgeCheck,
} from "lucide-react";
import { STEPS, MOCK_OFFERS, naira } from "./data";
import { Pill, Field } from "./shared";

export default function RequestForm({ go, addOrder }) {
  const [stage, setStage] = useState("form");
  const [form, setForm] = useState({ title: "", desc: "", budgetMin: "", budgetMax: "", qty: 1, location: "Jos", condition: "New", deadline: "" });
  const [request, setRequest] = useState(null);
  const [selectedOffer, setSelectedOffer] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const submit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    const req = {
      id: "REQ-" + Math.floor(1000 + Math.random() * 9000),
      title: form.title,
      budget: form.budgetMin || form.budgetMax ? `${naira(form.budgetMin || 0)} – ${naira(form.budgetMax || 0)}` : "Open",
      location: form.location,
      qty: form.qty,
    };
    setRequest(req);
    setStage("searching");
    timerRef.current = setTimeout(() => setStage("offers"), 2200);
  };

  if (stage === "accepted" && selectedOffer) {
    const activeIdx = 1;
    return (
      <div className="px-5 pt-6 pb-10">
        <div className="flex items-center gap-2 mb-5">
          <CheckCircle2 className="text-[#7C3AED]" size={22} />
          <h1 className="text-[19px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>Order confirmed</h1>
        </div>
        <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 mb-5 shadow-sm shadow-[#4C1D95]/5">
          <p className="text-[12px] text-[#6B6483] mb-1">{request.title}</p>
          <p className="text-[15px] font-semibold text-[#1E1B4B] mb-1">{selectedOffer.seller}</p>
          <p className="text-[18px] font-bold text-[#7C3AED]">{naira(selectedOffer.price)}</p>
        </div>
        <p className="text-[12px] font-medium text-[#514B67] mb-3 uppercase tracking-wide">Delivery status</p>
        <div className="space-y-0">
          {STEPS.map((s, i) => (
            <div key={s} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-3 h-3 rounded-full ${i <= activeIdx ? "bg-[#7C3AED]" : "bg-[#E4DFF5]"}`} />
                {i < STEPS.length - 1 && <div className={`w-0.5 flex-1 ${i < activeIdx ? "bg-[#7C3AED]" : "bg-[#E4DFF5]"}`} style={{ minHeight: 28 }} />}
              </div>
              <p className={`text-[13px] pb-6 ${i <= activeIdx ? "text-[#1E1B4B] font-medium" : "text-[#8A8372]"}`}>{s}</p>
            </div>
          ))}
        </div>
        <button onClick={() => go("account")} className="w-full text-white text-[13px] font-semibold py-3 rounded-xl" style={{ background: "linear-gradient(135deg,#1E1B4B,#3B1874)" }}>
          Track in My orders
        </button>
      </div>
    );
  }

  if (stage === "offers") {
    return (
      <div className="px-5 pt-6 pb-10">
        <p className="text-[11px] uppercase tracking-widest text-[#7C3AED] font-semibold mb-1">{request.id}</p>
        <h1 className="text-[19px] font-bold text-[#1E1B4B] mb-1" style={{ fontFamily: "Fraunces, serif" }}>{request.title}</h1>
        <p className="text-[13px] text-[#514B67] mb-5">3 sellers responded. Compare and choose.</p>
        <div className="space-y-3">
          {MOCK_OFFERS.map((o) => (
            <div key={o.id} className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 shadow-sm shadow-[#4C1D95]/5">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-[14px] font-semibold text-[#1E1B4B]">{o.seller}</p>
                  <div className="flex items-center gap-1 text-[11px] text-[#6B6483] mt-0.5">
                    {o.verified ? <Pill tone="green"><BadgeCheck size={10} /> Verified</Pill> : <Pill tone="stone">Unverified</Pill>}
                    <span className="flex items-center gap-0.5 ml-1"><Star size={10} className="fill-[#F59E0B] text-[#F59E0B]" />{o.rating}</span>
                    <span>· {o.orders} orders</span>
                  </div>
                </div>
                <p className="text-[16px] font-bold text-[#7C3AED]">{naira(o.price)}</p>
              </div>
              <div className="grid grid-cols-2 gap-y-1 text-[11px] text-[#514B67] mb-3">
                <span>Condition: {o.condition}</span>
                <span>Delivery: {o.delivery === "Pickup only" ? o.delivery : `₦${o.delivery}`}</span>
                <span>ETA: {o.eta}</span>
                <span>Warranty: {o.warranty}</span>
              </div>
              <p className="text-[11px] text-[#6B6483] italic mb-3">"{o.note}"</p>
              <button
                onClick={() => {
                  addOrder?.({ item: request.title, seller: o.seller, price: o.price, status: "Seller preparing", canReview: false, reviewed: false });
                  setSelectedOffer(o);
                  setStage("accepted");
                }}
                className="w-full text-white text-[12px] font-semibold py-2.5 rounded-xl"
                style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
              >
                Accept offer & pay
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (stage === "searching") {
    return (
      <div className="px-5 pt-6 pb-10 flex flex-col items-center justify-center min-h-[70vh]">
        <div className="relative w-20 h-20 mb-6">
          <div className="absolute inset-0 rounded-full border-4 border-[#ECE9F7]" />
          <div className="absolute inset-0 rounded-full border-4 border-[#7C3AED] border-t-transparent animate-spin" />
          <Search className="absolute inset-0 m-auto text-[#7C3AED]" size={22} />
        </div>
        <p className="text-[14px] font-semibold text-[#1E1B4B] mb-1">Searching trusted sellers in {form.location}…</p>
        <p className="text-[12px] text-[#6B6483] text-center max-w-[220px]">Matching "{form.title}" against our verified seller network.</p>
      </div>
    );
  }

  return (
    <div className="px-5 pt-6 pb-10">
      <h1 className="text-[20px] font-bold text-[#1E1B4B] mb-1" style={{ fontFamily: "Fraunces, serif" }}>Request an item</h1>
      <p className="text-[13px] text-[#514B67] mb-5">Don't know the exact name? Just describe the problem — we'll help classify it.</p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="What are you looking for?">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Mini UPS for my router" className="input" required />
        </Field>
        <Field label="Describe it in more detail">
          <textarea value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} rows={3} placeholder="Brand, model, part number, or just the problem it should solve…" className="input resize-none" />
        </Field>
        <div className="flex gap-2 text-[11px]">
          {[["photo", Camera, "Photo"], ["voice", Mic, "Voice note"], ["link", Link2, "Link"]].map(([key, Icon, label]) => {
            const on = !!form.attachments?.[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setForm((f) => ({ ...f, attachments: { ...f.attachments, [key]: !on } }))}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 border ${on ? "border-[#7C3AED] bg-[#F5F2FC] text-[#7C3AED]" : "border-dashed border-[#B7AFD6] text-[#514B67]"}`}
              >
                {on ? <CheckCircle2 size={13} /> : <Icon size={13} />} {on ? "Attached" : label}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Budget min (₦)"><input type="number" value={form.budgetMin} onChange={(e) => setForm({ ...form, budgetMin: e.target.value })} className="input" /></Field>
          <Field label="Budget max (₦)"><input type="number" value={form.budgetMax} onChange={(e) => setForm({ ...form, budgetMax: e.target.value })} className="input" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity"><input type="number" min={1} value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} className="input" /></Field>
          <Field label="Condition">
            <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} className="input">
              <option>New</option><option>Used</option><option>Either</option>
            </select>
          </Field>
        </div>
        <Field label="Location"><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="input" /></Field>
        <Field label="Deadline (optional)"><input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className="input" /></Field>
        <button type="submit" className="w-full text-white text-[14px] font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 mt-2 shadow-lg shadow-[#7C3AED]/25" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}>
          Submit request <ArrowRight size={15} />
        </button>
      </form>
      <style>{`.input{width:100%;background:white;border:1px solid #ECE9F7;border-radius:10px;padding:11px 13px;font-size:13px;color:#1E1B4B;outline:none} .input:focus{border-color:#7C3AED}`}</style>
    </div>
  );
}
