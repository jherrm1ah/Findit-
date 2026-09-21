"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, ArrowRight, ListOrdered, Sparkles, MapPin } from "lucide-react";
import { Field } from "./shared";
import { GROUPS } from "./data";
import { api } from "./api";
import { DURATION, EASE, wiggleIn, STAGGER_CONTAINER, STAGGER_ITEM, press } from "./motion";

export default function RequestForm({ go, showToast, myLocation }) {
  const [stage, setStage] = useState("form");
  const [form, setForm] = useState({ title: "", desc: "", category: "", budgetMin: "", budgetMax: "", qty: 1, location: "" });
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
        // FindIt is new-condition only — a request no longer offers Used
        // or Either as an option, since no seller can legitimately list
        // one to fulfill it.
        condition: "New",
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
        <motion.div
          initial={wiggleIn.initial}
          animate={wiggleIn.animate}
          transition={wiggleIn.transition}
          className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
        >
          <CheckCircle2 size={26} className="text-white" />
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.base, ease: EASE, delay: 0.15 }}
          className="text-[19px] font-bold text-[#1E1B4B] mb-2"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          Request sent
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.base, ease: EASE, delay: 0.22 }}
          className="text-[13px] text-[#6B6483] max-w-[280px] mb-6"
        >
          Real sellers can now see and respond to "{form.title}". We'll notify you the moment an offer comes in.
        </motion.p>
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.base, ease: EASE, delay: 0.29 }}
          onClick={() => go("myRequests")}
          {...press}
          className="flex items-center gap-2 text-white text-[13px] font-semibold px-5 py-3 rounded-xl mb-3"
          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
        >
          <ListOrdered size={14} /> View my requests
        </motion.button>
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DURATION.base, ease: EASE, delay: 0.35 }}
          onClick={() => go("home")}
          {...press}
          className="text-[12px] font-semibold text-[#6B6483]"
        >
          Back to home
        </motion.button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.base, ease: EASE }}
      className="px-5 pt-6 pb-10"
    >
      <h1 className="text-[20px] font-bold text-[#1E1B4B] mb-1" style={{ fontFamily: "Fraunces, serif" }}>Request an item</h1>
      <p className="text-[13px] text-[#514B67] mb-5">Don't know the exact name? Just describe the problem — real sellers will respond with offers.</p>
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.fast, ease: EASE }}
            className="text-[12px] text-[#E64980] mb-3"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
      <motion.form onSubmit={submit} className="space-y-4" initial="hidden" animate="visible" variants={STAGGER_CONTAINER}>
        <motion.div variants={STAGGER_ITEM}>
          <Field label="What are you looking for?">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Mini UPS for my router" maxLength={150} className="input" required />
          </Field>
        </motion.div>
        <motion.div variants={STAGGER_ITEM}>
          <Field label="Describe it in more detail">
            <textarea value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} rows={3} placeholder="Brand, model, part number, or just the problem it should solve…" maxLength={2000} className="input resize-none" />
          </Field>
        </motion.div>
        <motion.button
          variants={STAGGER_ITEM}
          type="button"
          onClick={suggestWithAi}
          disabled={classifying}
          {...press}
          className={`w-full flex items-center justify-center gap-1.5 rounded-xl py-2.5 border border-dashed border-[#B7AFD6] text-[12px] font-semibold text-[#7C3AED] ${classifying ? "opacity-60" : ""}`}
        >
          <Sparkles size={13} /> {classifying ? "Thinking…" : "Suggest title, category & budget with AI"}
        </motion.button>
        <motion.div variants={STAGGER_ITEM}>
          <Field label="Category">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input">
              <option value="">Not sure — leave it to sellers</option>
              {Object.entries(GROUPS).map(([key, g]) => (
                <option key={key} value={key}>{g.label}</option>
              ))}
            </select>
          </Field>
        </motion.div>
        <motion.div variants={STAGGER_ITEM} className="grid grid-cols-2 gap-3">
          <Field label="Budget min (₦)"><input type="number" value={form.budgetMin} onChange={(e) => setForm({ ...form, budgetMin: e.target.value })} className="input" /></Field>
          <Field label="Budget max (₦)"><input type="number" value={form.budgetMax} onChange={(e) => setForm({ ...form, budgetMax: e.target.value })} className="input" /></Field>
        </motion.div>
        <motion.div variants={STAGGER_ITEM}>
          <Field label="Quantity"><input type="number" min={1} value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} className="input" /></Field>
        </motion.div>
        <motion.div variants={STAGGER_ITEM}>
          <Field label="Delivery note (optional)"><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. nearest landmark or drop-off point" maxLength={120} className="input" /></Field>
        </motion.div>
        {myLocation && (
          <motion.p variants={STAGGER_ITEM} className="text-[11px] text-[#6B6483] -mt-2 flex items-center gap-1"><MapPin size={11} /> Using your current location so nearby sellers see this first.</motion.p>
        )}
        <motion.button
          variants={STAGGER_ITEM}
          type="submit"
          disabled={submitting}
          {...press}
          className={`w-full text-white text-[14px] font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 mt-2 shadow-lg shadow-[#7C3AED]/25 ${submitting ? "opacity-60" : ""}`}
          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
        >
          {submitting ? "Sending…" : <>Submit request <ArrowRight size={15} /></>}
        </motion.button>
      </motion.form>
      <style>{`.input{width:100%;background:white;border:1px solid #ECE9F7;border-radius:10px;padding:11px 13px;font-size:13px;color:#1E1B4B;outline:none} .input:focus{border-color:#7C3AED}`}</style>
    </motion.div>
  );
}
