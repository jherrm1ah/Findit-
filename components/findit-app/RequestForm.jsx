"use client";

import { useState } from "react";
import { CheckCircle2, ArrowRight, ListOrdered, Sparkles, MapPin } from "lucide-react";
import { Field } from "./shared";
import { GROUPS } from "./data";
import { api } from "./api";

export default function RequestForm({ go, showToast, myLocation }) {
  const [stage, setStage] = useState("form");
  const [form, setForm] = useState({ title: "", desc: "", category: "", budgetMin: "", budgetMax: "", qty: 1, location: "", condition: "New", deadline: "" });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [classifying, setClassifying] = useState(false);

  const suggestWithAi = async () => {
    if (!form.desc.trim() && !form.title.trim()) {
      showToast?.("Describe what you're looking for first.", "error");
      return;
    }
    setClassifying(true);
    try {
      const result = await api.classifyRequest(form.desc.trim() || form.title.trim());
      setForm((f) => ({
        ...f,
        title: f.title.trim() ? f.title : result.title,
        category: result.category,
        budgetMin: f.budgetMin || (result.estimatedBudgetMin != null ? String(result.estimatedBudgetMin) : f.budgetMin),
        budgetMax: f.budgetMax || (result.estimatedBudgetMax != null ? String(result.estimatedBudgetMax) : f.budgetMax),
      }));
      showToast?.(`AI suggested: ${result.categoryLabel}`);
    } catch (err) {
      showToast?.(err.message || "Couldn't get an AI suggestion — try again.", "error");
    } finally {
      setClassifying(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createRequest({
        title: form.title,
        description: form.desc,
        category: form.category || null,
        budgetMin: form.budgetMin,
        budgetMax: form.budgetMax,
        qty: form.qty,
        location: form.location,
        lat: myLocation?.lat ?? null,
        lng: myLocation?.lng ?? null,
        condition: form.condition,
      });
      setStage("submitted");
    } catch (err) {
      setError(err.message || "Couldn't submit that request — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (stage === "submitted") {
    return (
      <div className="px-5 pt-6 pb-10 flex flex-col items-center text-center min-h-[70vh] justify-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-5" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}>
          <CheckCircle2 size={26} className="text-white" />
        </div>
        <h1 className="text-[19px] font-bold text-[#1E1B4B] mb-2" style={{ fontFamily: "Fraunces, serif" }}>Request sent</h1>
        <p className="text-[13px] text-[#6B6483] max-w-[280px] mb-6">
          Real sellers can now see and respond to "{form.title}". We'll notify you the moment an offer comes in.
        </p>
        <button
          onClick={() => go("myRequests")}
          className="flex items-center gap-2 text-white text-[13px] font-semibold px-5 py-3 rounded-xl mb-3"
          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
        >
          <ListOrdered size={14} /> View my requests
        </button>
        <button onClick={() => go("home")} className="text-[12px] font-semibold text-[#6B6483]">Back to home</button>
      </div>
    );
  }

  return (
    <div className="px-5 pt-6 pb-10">
      <h1 className="text-[20px] font-bold text-[#1E1B4B] mb-1" style={{ fontFamily: "Fraunces, serif" }}>Request an item</h1>
      <p className="text-[13px] text-[#514B67] mb-5">Don't know the exact name? Just describe the problem — real sellers will respond with offers.</p>
      {error && <p className="text-[12px] text-[#E64980] mb-3">{error}</p>}
      <form onSubmit={submit} className="space-y-4">
        <Field label="What are you looking for?">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Mini UPS for my router" className="input" required />
        </Field>
        <Field label="Describe it in more detail">
          <textarea value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} rows={3} placeholder="Brand, model, part number, or just the problem it should solve…" className="input resize-none" />
        </Field>
        <button
          type="button"
          onClick={suggestWithAi}
          disabled={classifying}
          className={`w-full flex items-center justify-center gap-1.5 rounded-xl py-2.5 border border-dashed border-[#B7AFD6] text-[12px] font-semibold text-[#7C3AED] ${classifying ? "opacity-60" : ""}`}
        >
          <Sparkles size={13} /> {classifying ? "Thinking…" : "Suggest title, category & budget with AI"}
        </button>
        <Field label="Category">
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input">
            <option value="">Not sure — leave it to sellers</option>
            {Object.entries(GROUPS).map(([key, g]) => (
              <option key={key} value={key}>{g.label}</option>
            ))}
          </select>
        </Field>
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
        <Field label="Delivery note (optional)"><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. nearest landmark or drop-off point" className="input" /></Field>
        {myLocation && (
          <p className="text-[11px] text-[#6B6483] -mt-2 flex items-center gap-1"><MapPin size={11} /> Using your current location so nearby sellers see this first.</p>
        )}
        <Field label="Deadline (optional)"><input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className="input" /></Field>
        <button
          type="submit"
          disabled={submitting}
          className={`w-full text-white text-[14px] font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 mt-2 shadow-lg shadow-[#7C3AED]/25 ${submitting ? "opacity-60" : ""}`}
          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
        >
          {submitting ? "Sending…" : <>Submit request <ArrowRight size={15} /></>}
        </button>
      </form>
      <style>{`.input{width:100%;background:white;border:1px solid #ECE9F7;border-radius:10px;padding:11px 13px;font-size:13px;color:#1E1B4B;outline:none} .input:focus{border-color:#7C3AED}`}</style>
    </div>
  );
}
