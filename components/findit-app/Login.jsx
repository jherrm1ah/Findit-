"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Logo, Field } from "./shared";

export default function Login({ onDone }) {
  const [mode, setMode] = useState("login"); // login | signup
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const valid = phone.trim().length >= 10 && password.length >= 4;

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

      <div className="space-y-4 mb-2">
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

      {mode === "login" && (
        <button className="text-[12px] font-medium text-[#7C3AED] text-right mb-6 self-end">Forgot password?</button>
      )}
      {mode === "signup" && <div className="mb-6" />}

      <button
        onClick={onDone}
        disabled={!valid}
        className={`w-full text-white text-[14px] font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 mb-4 ${!valid ? "opacity-40" : "shadow-lg shadow-[#7C3AED]/25"}`}
        style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
      >
        {mode === "login" ? "Log in" : "Create account"} <ArrowRight size={16} />
      </button>

      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-[#ECE9F7]" />
        <span className="text-[11px] text-[#8A8372]">or</span>
        <div className="flex-1 h-px bg-[#ECE9F7]" />
      </div>

      <button onClick={onDone} className="w-full text-[#1E1B4B] text-[13px] font-semibold py-3 rounded-xl border border-[#ECE9F7] bg-white mb-6">
        Continue as guest
      </button>

      <p className="text-center text-[13px] text-[#6B6483] mt-auto">
        {mode === "login" ? "New to FindIt?" : "Already have an account?"}{" "}
        <button onClick={() => setMode((m) => (m === "login" ? "signup" : "login"))} className="font-semibold text-[#7C3AED]">
          {mode === "login" ? "Create account" : "Log in"}
        </button>
      </p>

      <style>{`.input{width:100%;background:white;border:1px solid #ECE9F7;border-radius:10px;padding:11px 13px;font-size:13px;color:#1E1B4B;outline:none} .input:focus{border-color:#7C3AED}`}</style>
    </div>
  );
}
