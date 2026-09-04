"use client";

import { useState } from "react";
import { ArrowRight, User, Store } from "lucide-react";
import { Logo, Field } from "./shared";
import { api } from "./api";

export default function Login({ onDone, showToast }) {
  const [mode, setMode] = useState("login"); // login | signup
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("buyer");
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const valid =
    phone.trim().length >= 10 &&
    password.length >= 4 &&
    (mode === "login" || (name.trim() && (role === "buyer" || businessName.trim())));

  const submit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    try {
      const user =
        mode === "login"
          ? await api.login({ phone, password })
          : await api.signup({ phone, password, name, role, businessName });
      onDone(user);
    } catch (err) {
      setError(err.message || "Something went wrong — try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#FAFAFF] flex flex-col px-6 pt-10 pb-8 overflow-y-auto">
      <div className="flex flex-col items-center mb-8">
        <Logo size={44} />
        <h1 className="text-[22px] font-bold text-[#1E1B4B] mt-4" style={{ fontFamily: "Fraunces, serif" }}>
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="text-[13px] text-[#6B6483] mt-1 text-center">
          {mode === "login" ? "Log in to track requests and orders." : "Join FindIt to start requesting hard-to-find items."}
        </p>
      </div>

      {mode === "signup" && (
        <div className="flex gap-2 mb-4">
          {[
            ["buyer", "I'm buying", User],
            ["seller", "I'm selling", Store],
          ].map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setRole(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 border text-[12.5px] font-medium ${
                role === key ? "border-[#7C3AED] bg-[#F5F2FC] text-[#7C3AED]" : "border-[#ECE9F7] text-[#514B67]"
              }`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-4 mb-2">
        {mode === "signup" && (
          <Field label="Your name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Amaka Okafor" className="input" />
          </Field>
        )}
        {mode === "signup" && role === "seller" && (
          <Field label="Business name">
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Terra Gadgets" className="input" />
          </Field>
        )}
        <Field label="Phone number">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="080X XXX XXXX"
            className="input"
          />
        </Field>
        <Field label="Password">
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input pr-10"
            />
            <button type="button" onClick={() => setShowPassword((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-[#7C3AED]">
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </Field>
      </div>

      {error && <p className="text-[12px] text-[#E64980] mb-3">{error}</p>}

      {mode === "login" && (
        <button
          type="button"
          onClick={() => showToast?.("Password reset isn't available in this demo yet.", "error")}
          className="text-[12px] font-medium text-[#7C3AED] text-right mb-6 self-end"
        >
          Forgot password?
        </button>
      )}
      {mode === "signup" && <div className="mb-6" />}

      <button
        onClick={submit}
        disabled={!valid || loading}
        className={`w-full text-white text-[14px] font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 mb-4 ${!valid || loading ? "opacity-40" : "shadow-lg shadow-[#7C3AED]/25"}`}
        style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
      >
        {loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
        {!loading && <ArrowRight size={16} />}
      </button>

      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-[#ECE9F7]" />
        <span className="text-[11px] text-[#8A8372]">or</span>
        <div className="flex-1 h-px bg-[#ECE9F7]" />
      </div>

      <button onClick={() => onDone(null)} className="w-full text-[#1E1B4B] text-[13px] font-semibold py-3 rounded-xl border border-[#ECE9F7] bg-white mb-6">
        Continue as guest
      </button>

      <p className="text-center text-[13px] text-[#6B6483] mt-auto">
        {mode === "login" ? "New to FindIt?" : "Already have an account?"}{" "}
        <button onClick={() => { setMode((m) => (m === "login" ? "signup" : "login")); setError(null); }} className="font-semibold text-[#7C3AED]">
          {mode === "login" ? "Create account" : "Log in"}
        </button>
      </p>

      <style>{`.input{width:100%;background:white;border:1px solid #ECE9F7;border-radius:10px;padding:11px 13px;font-size:13px;color:#1E1B4B;outline:none} .input:focus{border-color:#7C3AED}`}</style>
    </div>
  );
}
