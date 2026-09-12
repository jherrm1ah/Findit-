"use client";

import { useEffect, useState } from "react";
import { Field } from "./shared";
import { formatPhoneLocal } from "@/lib/phone";

export default function AccountDetails({
  user,
  onUpdateName,
  onUpdateBusinessName,
  onUpdatePhone,
  onUpdatePassword,
  showToast,
}) {
  const [name, setName] = useState(user.name);
  const [savingName, setSavingName] = useState(false);
  useEffect(() => setName(user.name), [user.name]);

  const [businessName, setBusinessName] = useState(user.businessName || "");
  const [savingBusinessName, setSavingBusinessName] = useState(false);
  useEffect(() => setBusinessName(user.businessName || ""), [user.businessName]);

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

  return (
    <div className="px-5 pt-6 pb-10">
      <h1 className="text-[19px] font-bold text-[#1E1B4B] mb-1" style={{ fontFamily: "Fraunces, serif" }}>
        Account details
      </h1>
      <p className="text-[12px] text-[#6B6483] mb-6">
        Update your name{user.role === "seller" ? ", business name" : ""}, phone number, and password.
      </p>

      <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 mb-4">
        <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3">Name</p>
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

      {user.role === "seller" && (
        <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 mb-4">
          <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3">Business name</p>
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

      <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 mb-4">
        <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3">Phone number</p>
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

      <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-4">
        <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3">Password</p>
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
