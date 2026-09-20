"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "motion/react";
import { User, Store, FileText, Phone, Lock, Pencil } from "lucide-react";
import { Field } from "./shared";
import { formatPhoneLocal } from "@/lib/phone";
import { DURATION, EASE, press } from "./motion";

// A section card's header row — icon + uppercase label — matching the
// pattern already used across the seller dashboard (BrandingCard, "Your
// store link", etc.) rather than this page's previous plain bold labels.
function SectionHeader({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={14} className="text-[#7C3AED]" />
      <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide">{label}</p>
    </div>
  );
}

export default function AccountDetails({
  user,
  onUpdateName,
  onUpdateBusinessName,
  onUpdatePhone,
  onUpdatePassword,
  bio,
  onUpdateBio,
  savingBio,
  showToast,
}) {
  const [name, setName] = useState(user.name);
  const [savingName, setSavingName] = useState(false);
  useEffect(() => setName(user.name), [user.name]);

  const [businessName, setBusinessName] = useState(user.businessName || "");
  const [savingBusinessName, setSavingBusinessName] = useState(false);
  useEffect(() => setBusinessName(user.businessName || ""), [user.businessName]);

  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState(bio ?? "");

  const [newPhone, setNewPhone] = useState(formatPhoneLocal(user.phone));
  const [phonePassword, setPhonePassword] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState(null);
  useEffect(() => setNewPhone(formatPhoneLocal(user.phone)), [user.phone]);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState(null);

  const saveName = async () => {
    if (!name.trim() || savingName) return;
    setSavingName(true);
    try {
      await onUpdateName(name.trim());
      showToast?.("Name updated.", "success");
    } catch (err) {
      showToast?.(err.message || "Couldn't update your name.", "error");
    } finally {
      setSavingName(false);
    }
  };

  const saveBusinessName = async () => {
    if (!businessName.trim() || savingBusinessName) return;
    setSavingBusinessName(true);
    try {
      await onUpdateBusinessName(businessName.trim());
      showToast?.("Business name updated.", "success");
    } catch (err) {
      showToast?.(err.message || "Couldn't update your business name.", "error");
    } finally {
      setSavingBusinessName(false);
    }
  };

  const startEditingBio = () => {
    setBioDraft(bio ?? "");
    setEditingBio(true);
  };

  const saveBio = async () => {
    try {
      await onUpdateBio?.(bioDraft);
      setEditingBio(false);
    } catch {
      // MainApp already surfaced a toast — stay in edit mode so nothing is lost.
    }
  };

  const savePhone = async () => {
    if (!newPhone.trim() || !phonePassword || savingPhone) return;
    setSavingPhone(true);
    setPhoneError(null);
    try {
      await onUpdatePhone(newPhone.trim(), phonePassword);
      setPhonePassword("");
      showToast?.("Phone number updated.", "success");
    } catch (err) {
      setPhoneError(err.message || "Couldn't update your phone number.");
    } finally {
      setSavingPhone(false);
    }
  };

  const savePassword = async () => {
    if (!currentPassword || newPassword.length < 4 || savingPassword) return;
    setSavingPassword(true);
    setPasswordError(null);
    try {
      await onUpdatePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      showToast?.("Password updated.", "success");
    } catch (err) {
      setPasswordError(err.message || "Couldn't update your password.");
    } finally {
      setSavingPassword(false);
    }
  };

  const isSeller = user.role === "seller";

  return (
    <div className="px-5 pt-6 pb-10">
      <h1 className="text-[19px] font-bold text-[#1E1B4B] mb-1" style={{ fontFamily: "Fraunces, serif" }}>
        Personal details
      </h1>
      <p className="text-[12px] text-[#6B6483] mb-5">
        Your name{isSeller ? ", business name, bio" : ""}, phone number, and password.
      </p>

      <div className="flex items-center gap-3 bg-white border border-[#ECE9F7] rounded-[20px] p-4 mb-5 shadow-sm shadow-[#4C1D95]/5">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 overflow-hidden relative"
          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
        >
          {user.avatarUrl ? (
            <Image src={user.avatarUrl} alt="" fill sizes="48px" className="object-cover" />
          ) : (
            <User size={20} className="text-white" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-[#1E1B4B] truncate">{user.name}</p>
          <p className="text-[11.5px] text-[#6B6483]">
            {formatPhoneLocal(user.phone)} · {isSeller ? "Seller account" : "Buyer account"}
          </p>
        </div>
      </div>

      <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 mb-4 shadow-sm shadow-[#4C1D95]/5">
        <SectionHeader icon={User} label="Name" />
        <Field label="Full name">
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
        </Field>
        <button
          onClick={saveName}
          disabled={!name.trim() || name.trim() === user.name || savingName}
          className="mt-3 text-[12.5px] font-semibold text-white px-4 py-2.5 rounded-xl disabled:opacity-40"
          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
        >
          {savingName ? "Saving…" : "Save name"}
        </button>
      </div>

      {isSeller && (
        <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 mb-4 shadow-sm shadow-[#4C1D95]/5">
          <SectionHeader icon={Store} label="Business name" />
          <Field label="Business name">
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="input" />
          </Field>
          <p className="text-[11px] text-[#8A8372] mt-2">
            This is what buyers see on your listings, orders, and offers.
          </p>
          <button
            onClick={saveBusinessName}
            disabled={!businessName.trim() || businessName.trim() === user.businessName || savingBusinessName}
            className="mt-3 text-[12.5px] font-semibold text-white px-4 py-2.5 rounded-xl disabled:opacity-40"
            style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
          >
            {savingBusinessName ? "Saving…" : "Save business name"}
          </button>
        </div>
      )}

      {isSeller && (
        <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 mb-4 shadow-sm shadow-[#4C1D95]/5">
          <div className="flex items-center justify-between mb-3">
            <SectionHeader icon={FileText} label="Bio" />
            {!editingBio && (
              <motion.button onClick={startEditingBio} {...press} className="flex items-center gap-1 text-[11px] font-semibold text-[#7C3AED]">
                <Pencil size={11} /> {bio ? "Edit" : "Add"}
              </motion.button>
            )}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            {editingBio ? (
              <motion.div
                key="editing"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: DURATION.fast, ease: EASE }}
              >
                <textarea
                  value={bioDraft}
                  onChange={(e) => setBioDraft(e.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder="Tell buyers what you sell and what makes your store worth trusting."
                  className="w-full bg-[#F5F2FC] rounded-xl px-3 py-2.5 text-[12.5px] text-[#1E1B4B] outline-none resize-none mb-2"
                />
                <div className="flex items-center gap-2">
                  <motion.button
                    onClick={saveBio}
                    disabled={savingBio}
                    {...press}
                    className={`text-[12.5px] font-semibold text-white px-4 py-2.5 rounded-xl ${savingBio ? "opacity-60" : ""}`}
                    style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
                  >
                    {savingBio ? "Saving…" : "Save bio"}
                  </motion.button>
                  <motion.button onClick={() => setEditingBio(false)} disabled={savingBio} {...press} className="text-[12.5px] font-semibold text-[#6B6483]">
                    Cancel
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.p
                key="viewing"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: DURATION.fast, ease: EASE }}
                className="text-[12.5px] text-[#514B67] leading-relaxed"
              >
                {bio || "Buyers see this on your public profile and storefront. Add a short bio."}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 mb-4 shadow-sm shadow-[#4C1D95]/5">
        <SectionHeader icon={Phone} label="Phone number" />
        <div className="space-y-3">
          <Field label="New phone number">
            <input type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="input" />
          </Field>
          <Field label="Current password (to confirm)">
            <input
              type="password"
              value={phonePassword}
              onChange={(e) => setPhonePassword(e.target.value)}
              placeholder="Your password"
              className="input"
            />
          </Field>
        </div>
        {phoneError && <p className="text-[12px] text-[#E64980] mt-3">{phoneError}</p>}
        <button
          onClick={savePhone}
          disabled={!newPhone.trim() || !phonePassword || savingPhone}
          className="mt-3 text-[12.5px] font-semibold text-white px-4 py-2.5 rounded-xl disabled:opacity-40"
          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
        >
          {savingPhone ? "Saving…" : "Save phone number"}
        </button>
      </div>

      <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 shadow-sm shadow-[#4C1D95]/5">
        <SectionHeader icon={Lock} label="Password" />
        <div className="space-y-3">
          <Field label="Current password">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="New password">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="input"
            />
          </Field>
        </div>
        {passwordError && <p className="text-[12px] text-[#E64980] mt-3">{passwordError}</p>}
        <button
          onClick={savePassword}
          disabled={!currentPassword || newPassword.length < 4 || savingPassword}
          className="mt-3 text-[12.5px] font-semibold text-white px-4 py-2.5 rounded-xl disabled:opacity-40"
          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
        >
          {savingPassword ? "Saving…" : "Update password"}
        </button>
      </div>

      <style>{`.input{width:100%;background:white;border:1px solid #ECE9F7;border-radius:10px;padding:11px 13px;font-size:13px;color:#1E1B4B;outline:none} .input:focus{border-color:#7C3AED}`}</style>
    </div>
  );
}
