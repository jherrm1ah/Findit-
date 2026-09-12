"use client";

import { useState } from "react";
import { ShieldCheck, ArrowLeft, Lock } from "lucide-react";
import { Field } from "./shared";
import { api } from "./api";

// Staff sign-in. Reaching the Admin Queue takes a second, explicit
// authentication even for someone already logged in as an admin — the
// password is re-verified server-side and the unlock is stamped on that one
// session, then ages out (see lib/auth.ts#isAdminSessionUnlocked).
//
// Nothing here decides access. This screen only collects the password; the
// server grants or refuses the unlock, and every admin route checks it
// independently. A person who never opens this screen still cannot reach a
// single admin endpoint.
export default function AdminLogin({ user, onUnlocked, onBack, showToast }) {
  const [phone, setPhone] = useState(user?.phone || "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const canSubmit = phone.trim() && password && !busy;

  const submit = async (e) => {
    e?.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.startAdminSession(phone.trim(), password);
      setPassword("");
      showToast?.("Admin session started.");
      onUnlocked?.(result);
    } catch (err) {
      // Shown verbatim: every message this route returns is written for the
      // person reading it, and none of them leak whether an account exists.
      setError(err.message || "Couldn't start your admin session.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-5 pt-5 pb-10">
      <button
        onClick={onBack}
        className="w-9 h-9 rounded-full bg-white border border-[#ECE9F7] flex items-center justify-center mb-6"
        aria-label="Go back"
      >
        <ArrowLeft size={16} className="text-[#1E1B4B]" />
      </button>

      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
      >
        <ShieldCheck size={22} className="text-white" />
      </div>

      <h1 className="text-[22px] font-bold text-[#1E1B4B] mb-1.5" style={{ fontFamily: "Fraunces, serif" }}>
        Staff sign-in
      </h1>
      <p className="text-[13px] text-[#6B6483] mb-6 leading-relaxed">
        The Admin Queue needs your password again, even though you&apos;re already signed in. This
        keeps a phone left unlocked on a desk from being an open admin panel.
      </p>

      <form onSubmit={submit} className="space-y-4 mb-2">
        <Field label="Phone number">
          <input
            id="admin-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="080X XXX XXXX"
            autoComplete="username"
            className="input"
          />
        </Field>

        <Field label="Password">
          <div className="relative">
            <input
              id="admin-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              autoComplete="current-password"
              className="input pr-14"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-[#7C3AED]"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </Field>

        {error && <p className="text-[12px] text-[#E64980]">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full h-12 rounded-full text-white text-[14px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
        >
          <Lock size={15} /> {busy ? "Checking…" : "Open Admin Queue"}
        </button>
      </form>

      <div className="mt-6 bg-white border border-[#ECE9F7] rounded-[20px] p-4">
        <p className="text-[12px] font-semibold text-[#1E1B4B] mb-1.5">How this session works</p>
        <ul className="text-[11.5px] text-[#6B6483] space-y-1.5 leading-relaxed">
          <li>It unlocks this device only. Signing in here never unlocks your other devices.</li>
          <li>It expires on its own after a period of inactivity, and you sign in again.</li>
          <li>Logging out, or leaving admin mode, ends it immediately.</li>
          <li>Every sign-in is recorded in the admin activity log.</li>
        </ul>
      </div>
    </div>
  );
}
