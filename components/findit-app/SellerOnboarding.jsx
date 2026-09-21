"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ShieldCheck, Camera, ClipboardCheck, ArrowRight, ArrowLeft,
  Check, ImagePlus, X, Loader2, AlertCircle, Navigation,
} from "lucide-react";
import { Field } from "./shared";
import { GROUPS } from "./data";
import { SELLER_TYPES } from "@/lib/sellerVerificationLevels";
import { requestBrowserLocation } from "./location";
import { api } from "./api";
import { DURATION, EASE, SPRING_SNAPPY, SPRING_SOFT, STAGGER_CONTAINER, STAGGER_ITEM, press } from "./motion";

const STEPS = ["business", "location", "verification", "review"];
const STEP_LABELS = { business: "Business", location: "Location", verification: "Verification", review: "Review" };

const EMPTY_FORM = {
  sellerType: null,
  category: Object.keys(GROUPS)[0],
  description: "",
  yearsSelling: "",
  instagram: "",
  whatsapp: "",
  facebook: "",
  hasPhysicalStore: null,
  publicState: "",
  publicCity: "",
  publicArea: "",
  shopAddress: "",
  website: "",
  lat: null,
  lng: null,
};

function inputCls(extra = "") {
  return `w-full bg-white border border-[#ECE9F7] rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-[#7C3AED] ${extra}`;
}

function StepDots({ step }) {
  const idx = STEPS.indexOf(step);
  return (
    <div className="flex items-center gap-1.5 mb-6">
      {STEPS.map((s, i) => (
        <div key={s} className="flex-1">
          <div className={`h-1.5 rounded-full transition-colors duration-300 ${i <= idx ? "bg-[#7C3AED]" : "bg-[#ECE9F7]"}`} />
          <p className={`text-[9.5px] mt-1 text-center transition-colors duration-200 ${i === idx ? "text-[#7C3AED] font-semibold" : "text-[#8A8372]"}`}>
            {STEP_LABELS[s]}
          </p>
        </div>
      ))}
    </div>
  );
}

function PhotoPicker({ label, files, onChange, hint }) {
  // One blob: URL per File, created once and reused across re-renders —
  // URL.createObjectURL(f) called straight in the render (the old code)
  // mints a brand-new, never-revoked URL on EVERY render, for every photo
  // already selected, not just a newly added one — typing anywhere else in
  // this multi-step form re-renders this component and leaks another batch.
  // This ref is the cache; the effects below revoke a file's URL once it's
  // removed, and everything still outstanding once the picker itself
  // unmounts (e.g. the wizard moves to another step).
  const urlsRef = useRef(new Map());

  useEffect(() => {
    const current = new Set(files);
    for (const [file, url] of urlsRef.current) {
      if (!current.has(file)) {
        URL.revokeObjectURL(url);
        urlsRef.current.delete(file);
      }
    }
  }, [files]);

  useEffect(
    () => () => {
      for (const url of urlsRef.current.values()) URL.revokeObjectURL(url);
      urlsRef.current.clear();
    },
    []
  );

  const urlFor = (file) => {
    let url = urlsRef.current.get(file);
    if (!url) {
      url = URL.createObjectURL(file);
      urlsRef.current.set(file, url);
    }
    return url;
  };

  const addFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    onChange([...files, ...picked].slice(0, 6));
  };
  const remove = (i) => onChange(files.filter((_, idx) => idx !== i));
  return (
    <div>
      <p className="text-[11.5px] font-medium text-[#514B67] mb-1.5">{label}</p>
      {hint && <p className="text-[10.5px] text-[#8A8372] mb-2">{hint}</p>}
      <motion.div className="flex flex-wrap gap-2" initial="hidden" animate="visible" variants={STAGGER_CONTAINER}>
        <AnimatePresence initial={false}>
          {files.map((f, i) => (
            <motion.div
              key={i}
              layout
              variants={STAGGER_ITEM}
              exit={{ opacity: 0, scale: 0.8, transition: { duration: DURATION.fast, ease: EASE } }}
              className="relative w-16 h-16 rounded-lg overflow-hidden border border-[#ECE9F7]"
            >
              {/* Deliberately a plain <img>, not next/image: this is a local
                  blob: URL preview of a file the browser already has in
                  memory before upload — there is no network fetch for
                  next/image to intercept or optimize, and a blob: URL isn't
                  a remote pattern it could route through anyway. */}
              <img src={urlFor(f)} alt="" className="w-full h-full object-cover" />
              <motion.button
                type="button"
                onClick={() => remove(i)}
                whileTap={{ scale: 0.85 }}
                transition={{ duration: DURATION.instant }}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 flex items-center justify-center"
                aria-label="Remove photo"
              >
                <X size={9} className="text-white" />
              </motion.button>
            </motion.div>
          ))}
        </AnimatePresence>
        {files.length < 6 && (
          <label className="w-16 h-16 rounded-lg border border-dashed border-[#B7AFD6] flex items-center justify-center cursor-pointer">
            <ImagePlus size={16} className="text-[#B7AFD6]" />
            <input type="file" accept="image/*" multiple className="hidden" onChange={addFiles} />
          </label>
        )}
      </motion.div>
    </div>
  );
}

export default function SellerOnboarding({ go, showToast, userId }) {
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState("business");
  const [form, setForm] = useState(EMPTY_FORM);
  const [productPhotos, setProductPhotos] = useState([]);
  const [shopPhotos, setShopPhotos] = useState([]);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [priorStatus, setPriorStatus] = useState(null);
  const [rejectionReason, setRejectionReason] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const overview = await api.getMyVerification();
        if (cancelled) return;
        setPriorStatus(overview.status);
        setRejectionReason(overview.rejectionReason);
        if (overview.status !== "incomplete") {
          setForm((f) => ({
            ...f,
            sellerType: overview.sellerType ?? f.sellerType,
            category: overview.category ?? f.category,
            description: overview.description ?? "",
            yearsSelling: overview.yearsSelling ?? "",
            instagram: overview.socialLinks?.instagram ?? "",
            whatsapp: overview.socialLinks?.whatsapp ?? "",
            facebook: overview.socialLinks?.facebook ?? "",
            hasPhysicalStore: overview.hasPhysicalStore,
            publicState: overview.publicState ?? "",
            publicCity: overview.publicCity ?? "",
            publicArea: overview.publicArea ?? "",
            shopAddress: overview.shopAddress ?? "",
            website: overview.website ?? "",
            lat: overview.lat,
            lng: overview.lng,
          }));
        }
      } catch {
        // A brand-new seller has nothing to prefill — start from EMPTY_FORM.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const evidenceCount =
    productPhotos.length +
    shopPhotos.length +
    [form.instagram, form.whatsapp, form.facebook, form.website].filter((v) => v.trim()).length;

  const stepValid = {
    business: Boolean(form.sellerType && form.category && form.category.trim()),
    location: form.hasPhysicalStore !== null && (!form.hasPhysicalStore || form.shopAddress.trim()),
    verification: evidenceCount >= 1,
    review: true,
  }[step];

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const loc = await requestBrowserLocation(userId);
      set({ lat: loc.lat, lng: loc.lng });
      showToast?.("Location added — only used for verification.", "success");
    } catch {
      showToast?.("Couldn't get your location — you can skip this.", "error");
    } finally {
      setLocating(false);
    }
  };

  const goStep = (dir) => {
    const idx = STEPS.indexOf(step);
    const next = STEPS[idx + dir];
    if (next) setStep(next);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const linkEvidence = [];
      if (form.instagram.trim()) linkEvidence.push({ kind: "social_link", textValue: form.instagram.trim(), note: "Instagram" });
      if (form.whatsapp.trim()) linkEvidence.push({ kind: "social_link", textValue: form.whatsapp.trim(), note: "WhatsApp" });
      if (form.facebook.trim()) linkEvidence.push({ kind: "social_link", textValue: form.facebook.trim(), note: "Facebook" });
      if (form.website.trim()) linkEvidence.push({ kind: "business_page", textValue: form.website.trim(), note: "Website" });

      await api.submitVerification(
        {
          sellerType: form.sellerType,
          category: form.category,
          description: form.description || null,
          yearsSelling: form.yearsSelling || null,
          socialLinks: { instagram: form.instagram, whatsapp: form.whatsapp, facebook: form.facebook },
          hasPhysicalStore: form.hasPhysicalStore,
          publicState: form.publicState || null,
          publicCity: form.publicCity || null,
          publicArea: form.publicArea || null,
          shopAddress: form.hasPhysicalStore ? form.shopAddress || null : null,
          website: form.website || null,
          lat: form.lat,
          lng: form.lng,
          linkEvidence,
        },
        { product_photo: productPhotos, shop_photo: shopPhotos }
      );
      setSubmitted(true);
    } catch (err) {
      showToast?.(err.message || "Couldn't submit your verification — try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!loaded) {
    return (
      <div className="px-5 pt-16 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-[#7C3AED]" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="px-5 pt-16 pb-10 flex flex-col items-center text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={SPRING_SOFT}
          className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
        >
          <Check size={26} className="text-white" strokeWidth={2.2} />
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.base, ease: EASE, delay: 0.15 }}
          className="text-[18px] font-bold text-[#1E1B4B] mb-2"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          Submitted for verification
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.base, ease: EASE, delay: 0.22 }}
          className="text-[13px] text-[#6B6483] max-w-[280px] mb-6"
        >
          A FindIt admin will review your information — usually within a day or two. You can keep selling on FindIt in the meantime.
        </motion.p>
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.base, ease: EASE, delay: 0.29 }}
          onClick={() => go("seller")}
          {...press}
          className="text-white text-[13px] font-semibold px-5 py-3 rounded-xl"
          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
        >
          Back to dashboard
        </motion.button>
      </div>
    );
  }

  return (
    <div className="px-5 pt-6 pb-10">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={17} className="text-[#7C3AED]" />
        <h1 className="text-[19px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>Seller verification</h1>
      </div>
      <p className="text-[12px] text-[#6B6483] mb-5">
        Help buyers know who they're buying from. This doesn't stop you from selling now — it unlocks the Verified badge.
      </p>

      {(priorStatus === "needs_info" || priorStatus === "rejected") && rejectionReason && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DURATION.base, ease: EASE }} className="flex items-start gap-2.5 bg-[#FDF0F4] rounded-xl p-3 mb-5">
          <AlertCircle size={14} className="text-[#C22468] shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-[#C22468] mb-0.5">
              {priorStatus === "needs_info" ? "FindIt needs more information" : "Your last submission wasn't approved"}
            </p>
            <p className="text-[11.5px] text-[#514B67]">{rejectionReason}</p>
          </div>
        </motion.div>
      )}

      <StepDots step={step} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: DURATION.base, ease: EASE }}
        >
      {step === "business" && (
        <div className="space-y-4">
          <div>
            <p className="text-[11.5px] font-medium text-[#514B67] mb-1.5">What type of seller are you?</p>
            <div className="grid grid-cols-2 gap-2">
              {SELLER_TYPES.map((t) => (
                <motion.button
                  key={t.value}
                  type="button"
                  onClick={() => set({ sellerType: t.value })}
                  whileTap={{ scale: 0.97 }}
                  transition={SPRING_SNAPPY}
                  className={`text-left px-3 py-2.5 rounded-xl border text-[12px] font-medium transition-colors duration-150 ${
                    form.sellerType === t.value ? "border-[#7C3AED] bg-[#F5F2FC] text-[#7C3AED]" : "border-[#ECE9F7] text-[#514B67]"
                  }`}
                >
                  {t.label}
                </motion.button>
              ))}
            </div>
          </div>
          <Field label="What do you sell?">
            <select value={form.category} onChange={(e) => set({ category: e.target.value })} className={inputCls()}>
              {Object.entries(GROUPS).map(([key, g]) => (
                <option key={key} value={key}>{g.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Short description (optional)">
            <textarea
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
              rows={3}
              maxLength={2000}
              placeholder="Tell buyers what makes your store worth buying from."
              className={inputCls("resize-none")}
            />
          </Field>
          <Field label="How long have you been selling? (optional)">
            <input value={form.yearsSelling} onChange={(e) => set({ yearsSelling: e.target.value })} placeholder="e.g. 2 years, or Just starting" maxLength={200} className={inputCls()} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Instagram (optional)">
              <input value={form.instagram} onChange={(e) => set({ instagram: e.target.value })} placeholder="@yourstore" maxLength={200} className={inputCls()} />
            </Field>
            <Field label="WhatsApp (optional)">
              <input value={form.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} placeholder="0801…" maxLength={200} className={inputCls()} />
            </Field>
          </div>
        </div>
      )}

      {step === "location" && (
        <div className="space-y-4">
          <div>
            <p className="text-[11.5px] font-medium text-[#514B67] mb-1.5">Do you have a physical store?</p>
            <div className="flex gap-2">
              {[
                [true, "Yes, I have a shop"],
                [false, "No — home-based or online"],
              ].map(([val, label]) => (
                <motion.button
                  key={String(val)}
                  type="button"
                  onClick={() => set({ hasPhysicalStore: val })}
                  whileTap={{ scale: 0.97 }}
                  transition={SPRING_SNAPPY}
                  className={`flex-1 px-3 py-2.5 rounded-xl border text-[12px] font-medium transition-colors duration-150 ${
                    form.hasPhysicalStore === val ? "border-[#7C3AED] bg-[#F5F2FC] text-[#7C3AED]" : "border-[#ECE9F7] text-[#514B67]"
                  }`}
                >
                  {label}
                </motion.button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Field label="State"><input value={form.publicState} onChange={(e) => set({ publicState: e.target.value })} placeholder="Lagos" maxLength={200} className={inputCls()} /></Field>
            <Field label="City"><input value={form.publicCity} onChange={(e) => set({ publicCity: e.target.value })} placeholder="Ikeja" maxLength={200} className={inputCls()} /></Field>
            <Field label="Area"><input value={form.publicArea} onChange={(e) => set({ publicArea: e.target.value })} placeholder="Allen Ave" maxLength={200} className={inputCls()} /></Field>
          </div>
          <p className="text-[10.5px] text-[#8A8372] -mt-2">This general area is shown on your public storefront.</p>

          <AnimatePresence initial={false}>
            {form.hasPhysicalStore && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: DURATION.fast, ease: EASE }}
                className="overflow-hidden"
              >
                <Field label="Shop address">
                  <textarea
                    value={form.shopAddress}
                    onChange={(e) => set({ shopAddress: e.target.value })}
                    rows={2}
                    maxLength={2000}
                    placeholder="Full address — only used for verification, never shown publicly."
                    className={inputCls("resize-none")}
                  />
                </Field>
              </motion.div>
            )}
          </AnimatePresence>

          <Field label="Website (optional)">
            <input value={form.website} onChange={(e) => set({ website: e.target.value })} placeholder="https://…" maxLength={200} className={inputCls()} />
          </Field>

          <motion.button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            {...press}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-[#7C3AED] disabled:opacity-50"
          >
            <Navigation size={13} /> {locating ? "Getting location…" : form.lat != null ? "Location added ✓" : "Use my current location (optional)"}
          </motion.button>
        </div>
      )}

      {step === "verification" && (
        <div className="space-y-5">
          <div className="flex items-start gap-2.5 bg-[#F5F2FC] rounded-xl p-3">
            <Camera size={14} className="text-[#7C3AED] shrink-0 mt-0.5" />
            <p className="text-[11.5px] text-[#514B67]">
              Add at least one piece of evidence — a real photo, or the social/website links from the last step already count.
            </p>
          </div>
          <PhotoPicker
            label="Product photos"
            files={productPhotos}
            onChange={setProductPhotos}
            hint="Real photos of what you sell — not stock images."
          />
          {form.hasPhysicalStore && (
            <PhotoPicker
              label="Shop photos"
              files={shopPhotos}
              onChange={setShopPhotos}
              hint="Your storefront or shop interior."
            />
          )}
          <p className="text-[11.5px] text-[#6B6483]">Evidence pieces so far: <span className="font-semibold text-[#1E1B4B]">{evidenceCount}</span></p>
        </div>
      )}

      {step === "review" && (
        <motion.div className="space-y-3" initial="hidden" animate="visible" variants={STAGGER_CONTAINER}>
          {[
            ["Seller type", SELLER_TYPES.find((t) => t.value === form.sellerType)?.label || "—"],
            ["What you sell", GROUPS[form.category]?.label || form.category],
            ["Location", [form.publicArea, form.publicCity, form.publicState].filter(Boolean).join(", ") || "—"],
            ["Physical store", form.hasPhysicalStore === null ? "—" : form.hasPhysicalStore ? "Yes" : "No"],
            ["Evidence", `${evidenceCount} item${evidenceCount === 1 ? "" : "s"}`],
          ].map(([label, value]) => (
            <motion.div key={label} variants={STAGGER_ITEM} className="flex items-center justify-between bg-white border border-[#ECE9F7] rounded-xl px-3 py-2.5">
              <p className="text-[11.5px] text-[#8A8372]">{label}</p>
              <p className="text-[12px] font-semibold text-[#1E1B4B] text-right">{value}</p>
            </motion.div>
          ))}
          <motion.p variants={STAGGER_ITEM} className="text-[11px] text-[#6B6483] pt-2">
            An admin will review this before your Verified badge appears. You can keep selling on FindIt while it's under review.
          </motion.p>
        </motion.div>
      )}
        </motion.div>
      </AnimatePresence>

      <div className="flex gap-2 mt-7">
        {STEPS.indexOf(step) > 0 && (
          <motion.button onClick={() => goStep(-1)} {...press} className="flex items-center gap-1.5 px-4 py-3 rounded-xl border border-[#ECE9F7] text-[#514B67] text-[13px] font-semibold">
            <ArrowLeft size={14} /> Back
          </motion.button>
        )}
        {step !== "review" ? (
          <motion.button
            onClick={() => goStep(1)}
            disabled={!stepValid}
            {...press}
            className={`flex-1 flex items-center justify-center gap-1.5 text-white text-[13px] font-semibold py-3 rounded-xl ${!stepValid ? "opacity-40" : ""}`}
            style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
          >
            Continue <ArrowRight size={14} />
          </motion.button>
        ) : (
          <motion.button
            onClick={submit}
            disabled={submitting}
            {...press}
            className={`flex-1 flex items-center justify-center gap-1.5 text-white text-[13px] font-semibold py-3 rounded-xl ${submitting ? "opacity-60" : ""}`}
            style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
          >
            <ClipboardCheck size={14} /> {submitting ? "Submitting…" : "Submit for verification"}
          </motion.button>
        )}
      </div>
    </div>
  );
}
