"use client";

import { useState } from "react";
import { ArrowRight, User, Store } from "lucide-react";
import { Logo, Field } from "./shared";
import { api } from "./api";

export default function Login({ onDone, showToast }) {
  const [mode, setMode] = useState("login"); // login | signup
  const [step, setStep] = useState("form"); // form | code (signup phone verification)
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("buyer");
  const [businessName, setBusinessName] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [resending, setResending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const valid =
    phone.trim().length >= 10 &&
    password.length >= 4 &&
    (mode === "login" || (name.trim() && (role === "buyer" || businessName.trim())));

  const doSignup = () => api.signup({ phone, password, name, role, businessName });

  const submit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    try {
      if (mode === "login") {
        onDone(await api.login({ phone, password }));
        return;
      }
      // Signup: try to send a verification code first. If phone
      // verification isn't enabled yet, this returns { enabled: false }
      // and we fall straight through to creating the account as before.
      const otpResult = await api.sendOtp(phone);
      if (otpResult.enabled === false) {
        onDone(await doSignup());
        return;
      }
      setStep("code");
    } catch (err) {
      setError(err.message || "Something went wrong — try again.");
    } finally {
      setLoading(false);
    }
  };

  const verifyAndCreateAccount = async () => {
    if (otpCode.trim().length < 4 || loading) return;
    setLoading(true);
    setError(null);
    try {
      await api.verifyOtp(phone, otpCode.trim());
      onDone(await doSignup());
    } catch (err) {
      setError(err.message || "Something went wrong — try again.");
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    if (resending) return;
    setResending(true);
    setError(null);
    try {
      await api.sendOtp(phone);
      showToast?.("Code resent.", "success");
    } catch (err) {
      setError(err.message || "Couldn't resend the code — try again.");
    } finally {
      setResending(false);
    }
  };

  if (step === "code") {
    return (
      <div className="fixed inset-0 z-50 bg-[#FAFAFF] flex flex-col px-6 pt-10 pb-8 overflow-y-auto">
        <div className="flex flex-col items-center mb-8">
          <Logo size={44} />
          <h1 className="text-[22px] font-bold text-[#1E1B4B] mt-4" style={{ fontFamily: "Fraunces, serif" }}>
            Verify your phone
          </h1>
          <p className="text-[13px] text-[#6B6483] mt-1 text-center">
            Enter the code we sent to {phone}.
          </p>
        </div>

        <Field label="Verification code">
          <input
            type="tel"
            inputMode="numeric"
            maxLength={6}
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            className="input tracking-[0.3em] text-center"
          />
        </Field>

        {error && <p className="text-[12px] text-[#E64980] mt-3">{error}</p>}

        <button
          type="button"
          onClick={resendCode}
          disabled={resending}
          className="text-[12px] font-medium text-[#7C3AED] text-right mt-3 mb-6 self-end disabled:opacity-40"
        >
          {resending ? "Resending…" : "Resend code"}
        </button>

        <button
          onClick={verifyAndCreateAccount}
          disabled={otpCode.trim().length < 4 || loading}
          className={`w-full text-white text-[14px] font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 mb-4 ${
            otpCode.trim().length < 4 || loading ? "opacity-40" : "shadow-lg shadow-[#7C3AED]/25"
          }`}
          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
        >
          {loading ? "Verifying…" : "Verify & create account"}
          {!loading && <ArrowRight size={16} />}
        </button>

        <button
          type="button"
          onClick={() => { setStep("form"); setOtpCode(""); setError(null); }}
          className="text-center text-[13px] font-semibold text-[#7C3AED] mt-auto"
        >
          ← Change phone number
        </button>

        <style>{`.input{width:100%;background:white;border:1px solid #ECE9F7;border-radius:10px;padding:11px 13px;font-size:13px;color:#1E1B4B;outline:none} .input:focus{border-color:#7C3AED}`}</style>
      </div>
    );
  }

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
              placeholder="Your password"
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
          onClick={() => showToast?.("Password reset isn't available yet — contact support.", "error")}
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
