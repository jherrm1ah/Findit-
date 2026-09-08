"use client";

import { useEffect, useState } from "react";
import { ArrowRight, User, Store } from "lucide-react";
import { Logo, Field } from "./shared";
import { api } from "./api";
import OtpInput from "./OtpInput";

function formatMMSS(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export default function Login({ onDone, showToast }) {
  const [mode, setMode] = useState("login"); // login | signup | reset
  const [step, setStep] = useState("form"); // form | code | newPassword
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
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [expiresAt, setExpiresAt] = useState(null);
  const [resendAvailableAt, setResendAvailableAt] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (step !== "code") return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [step]);

  const secondsLeft = expiresAt ? Math.max(0, Math.round((expiresAt - now) / 1000)) : 0;
  const resendSecondsLeft = resendAvailableAt ? Math.max(0, Math.round((resendAvailableAt - now) / 1000)) : 0;
  const codeExpired = step === "code" && expiresAt !== null && secondsLeft <= 0;

  const applyOtpTimers = (otpResult) => {
    const expiresIn = otpResult?.expiresIn ?? 600;
    const resendIn = otpResult?.resendAvailableIn ?? 60;
    setExpiresAt(Date.now() + expiresIn * 1000);
    setResendAvailableAt(Date.now() + resendIn * 1000);
  };

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
      applyOtpTimers(otpResult);
      setStep("code");
    } catch (err) {
      setError(err.message || "Something went wrong — try again.");
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(otpCode) || loading || codeExpired) return;
    setLoading(true);
    setError(null);
    try {
      try {
        await api.verifyOtp(phone, otpCode.trim(), mode === "reset" ? "reset" : "signup");
      } catch (err) {
        // Clear the boxes so the next attempt starts from a clean field rather
        // than leaving the rejected digits in place for the user to delete.
        // Only on a rejected code: if the code was accepted and signup then
        // failed, wiping it would leave the user unable to retry.
        setOtpCode("");
        throw err;
      }
      if (mode === "reset") {
        setStep("newPassword");
      } else {
        onDone(await doSignup());
      }
    } catch (err) {
      setError(err.message || "Something went wrong — try again.");
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    if (resending || resendSecondsLeft > 0) return;
    setResending(true);
    setError(null);
    try {
      const otpResult = await api.resendOtp(phone, mode === "reset" ? "reset" : "signup");
      applyOtpTimers(otpResult);
      setOtpCode("");
      showToast?.("Code resent.", "success");
    } catch (err) {
      // A cooldown rejection carries retryAfter — sync the timer to it
      // rather than just showing an error, so the button reflects reality
      // even if the client's own countdown drifted from the server's.
      if (typeof err.retryAfter === "number") {
        setResendAvailableAt(Date.now() + err.retryAfter * 1000);
      }
      setError(err.message || "Couldn't resend the code — try again.");
    } finally {
      setResending(false);
    }
  };

  const sendResetCode = async () => {
    if (phone.trim().length < 10 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const otpResult = await api.sendOtp(phone, "reset");
      if (otpResult.enabled === false) {
        showToast?.("Password reset isn't available yet — contact support.", "error");
        setMode("login");
        return;
      }
      applyOtpTimers(otpResult);
      setStep("code");
    } catch (err) {
      setError(err.message || "Something went wrong — try again.");
    } finally {
      setLoading(false);
    }
  };

  const submitNewPassword = async () => {
    if (newPassword.length < 4 || newPassword !== newPasswordConfirm || loading) return;
    setLoading(true);
    setError(null);
    try {
      await api.resetPassword(phone, newPassword);
      showToast?.("Password updated — log in with your new password.", "success");
      setMode("login");
      setStep("form");
      setPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setOtpCode("");
    } catch (err) {
      setError(err.message || "Something went wrong — try again.");
    } finally {
      setLoading(false);
    }
  };

  if (mode === "reset" && step === "form") {
    return (
      <div className="fixed inset-0 z-50 bg-[#FAFAFF] flex flex-col px-6 pt-10 pb-8 overflow-y-auto">
        <div className="flex flex-col items-center mb-8">
          <Logo size={44} />
          <h1 className="text-[22px] font-bold text-[#1E1B4B] mt-4" style={{ fontFamily: "Fraunces, serif" }}>
            Reset your password
          </h1>
          <p className="text-[13px] text-[#6B6483] mt-1 text-center">
            Enter your phone number and we'll send you a code.
          </p>
        </div>

        <Field label="Phone number">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="080X XXX XXXX"
            className="input"
          />
        </Field>

        {error && <p className="text-[12px] text-[#E64980] mt-3">{error}</p>}

        <button
          onClick={sendResetCode}
          disabled={phone.trim().length < 10 || loading}
          className={`w-full text-white text-[14px] font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 mt-6 mb-4 ${
            phone.trim().length < 10 || loading ? "opacity-40" : "shadow-lg shadow-[#7C3AED]/25"
          }`}
          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
        >
          {loading ? "Sending…" : "Send code"}
          {!loading && <ArrowRight size={16} />}
        </button>

        <button
          type="button"
          onClick={() => { setMode("login"); setError(null); }}
          className="text-center text-[13px] font-semibold text-[#7C3AED] mt-auto"
        >
          ← Back to log in
        </button>

        <style>{`.input{width:100%;background:white;border:1px solid #ECE9F7;border-radius:10px;padding:11px 13px;font-size:13px;color:#1E1B4B;outline:none} .input:focus{border-color:#7C3AED}`}</style>
      </div>
    );
  }

  if (mode === "reset" && step === "newPassword") {
    const validNewPassword = newPassword.length >= 4 && newPassword === newPasswordConfirm;
    return (
      <div className="fixed inset-0 z-50 bg-[#FAFAFF] flex flex-col px-6 pt-10 pb-8 overflow-y-auto">
        <div className="flex flex-col items-center mb-8">
          <Logo size={44} />
          <h1 className="text-[22px] font-bold text-[#1E1B4B] mt-4" style={{ fontFamily: "Fraunces, serif" }}>
            Choose a new password
          </h1>
          <p className="text-[13px] text-[#6B6483] mt-1 text-center">Your phone number is verified.</p>
        </div>

        <div className="space-y-4">
          <Field label="New password">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 4 characters"
              className="input"
            />
          </Field>
          <Field label="Confirm new password">
            <input
              type="password"
              value={newPasswordConfirm}
              onChange={(e) => setNewPasswordConfirm(e.target.value)}
              className="input"
            />
          </Field>
        </div>

        {newPassword && newPasswordConfirm && newPassword !== newPasswordConfirm && (
          <p className="text-[12px] text-[#E64980] mt-3">Passwords don't match.</p>
        )}
        {error && <p className="text-[12px] text-[#E64980] mt-3">{error}</p>}

        <button
          onClick={submitNewPassword}
          disabled={!validNewPassword || loading}
          className={`w-full text-white text-[14px] font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 mt-6 ${
            !validNewPassword || loading ? "opacity-40" : "shadow-lg shadow-[#7C3AED]/25"
          }`}
          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
        >
          {loading ? "Saving…" : "Reset password"}
          {!loading && <ArrowRight size={16} />}
        </button>

        <style>{`.input{width:100%;background:white;border:1px solid #ECE9F7;border-radius:10px;padding:11px 13px;font-size:13px;color:#1E1B4B;outline:none} .input:focus{border-color:#7C3AED}`}</style>
      </div>
    );
  }

  if (step === "code") {
    const maskedPhone = phone.length > 4 ? `${phone.slice(0, -4).replace(/./g, "•")}${phone.slice(-4)}` : phone;
    return (
      <div className="fixed inset-0 z-50 bg-[#FAFAFF] flex flex-col px-6 pt-10 pb-8 overflow-y-auto">
        <div className="flex flex-col items-center mb-8">
          <Logo size={44} />
          <h1 className="text-[22px] font-bold text-[#1E1B4B] mt-4" style={{ fontFamily: "Fraunces, serif" }}>
            Verify your phone
          </h1>
          <p className="text-[13px] text-[#6B6483] mt-1 text-center">
            We sent a 6-digit code to {maskedPhone}.
          </p>
        </div>

        <OtpInput value={otpCode} onChange={setOtpCode} disabled={loading || codeExpired} />

        <p className={`text-center text-[12px] mt-4 ${codeExpired ? "text-[#E64980] font-medium" : "text-[#8A8372]"}`}>
          {codeExpired ? "This code has expired. Please request a new one." : `Code expires in ${formatMMSS(secondsLeft)}`}
        </p>

        {error && <p className="text-[12px] text-[#E64980] text-center mt-3">{error}</p>}

        <div className="text-center mt-3 mb-6">
          {resendSecondsLeft > 0 ? (
            <span className="text-[12px] text-[#8A8372]">Resend available in {formatMMSS(resendSecondsLeft)}</span>
          ) : (
            <button
              type="button"
              onClick={resendCode}
              disabled={resending}
              className="text-[12px] font-semibold text-[#7C3AED] disabled:opacity-40"
            >
              {resending ? "Resending…" : "Resend code"}
            </button>
          )}
        </div>

        <button
          onClick={verifyCode}
          disabled={!/^\d{6}$/.test(otpCode) || loading || codeExpired}
          className={`w-full text-white text-[14px] font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 mb-4 ${
            !/^\d{6}$/.test(otpCode) || loading || codeExpired ? "opacity-40" : "shadow-lg shadow-[#7C3AED]/25"
          }`}
          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
        >
          {loading ? "Verifying…" : mode === "reset" ? "Verify code" : "Verify & create account"}
          {!loading && <ArrowRight size={16} />}
        </button>

        <button
          type="button"
          onClick={() => { setStep("form"); setOtpCode(""); setError(null); setExpiresAt(null); setResendAvailableAt(null); }}
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
          onClick={() => { setMode("reset"); setStep("form"); setError(null); }}
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
