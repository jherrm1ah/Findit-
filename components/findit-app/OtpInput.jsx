"use client";

import { useEffect, useRef } from "react";

// Six separate auto-advancing digit boxes, matching how OTP entry looks
// everywhere else. Supports paste (the whole code at once, from any box)
// and autofill — the first box's autoComplete="one-time-code" is the web
// platform's hook for a browser/OS to offer to fill in an SMS code it just
// saw (the native-app equivalent, e.g. Android's SMS Retriever API, only
// applies inside a native app shell, not this web app).
export default function OtpInput({ value, onChange, length = 6, disabled, autoFocus = true }) {
  const refs = useRef([]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const setDigitAt = (index, char) => {
    const chars = value.padEnd(length, "").split("");
    chars[index] = char;
    onChange(chars.join("").slice(0, length).replace(/\s+$/, ""));
  };

  const handleChange = (index, e) => {
    const raw = e.target.value.replace(/\D/g, "");
    if (!raw) {
      setDigitAt(index, "");
      return;
    }
    if (raw.length > 1) {
      // A paste or autofill landed in a single box — spread it forward.
      const incoming = raw.slice(0, length - index).split("");
      const newValue = (value.slice(0, index) + incoming.join("")).slice(0, length);
      onChange(newValue);
      refs.current[Math.min(index + incoming.length, length - 1)]?.focus();
      return;
    }
    setDigitAt(index, raw);
    if (index < length - 1) refs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !value[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    onChange(pasted);
    refs.current[Math.min(pasted.length, length - 1)]?.focus();
  };

  return (
    <div role="group" aria-label="Verification code" className="flex gap-2 justify-center" onPaste={handlePaste}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={value[i] || ""}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          disabled={disabled}
          aria-label={`Digit ${i + 1} of ${length}`}
          className="w-11 h-[52px] text-center text-[18px] font-semibold rounded-xl border border-[#ECE9F7] text-[#1E1B4B] outline-none focus:border-[#7C3AED] disabled:opacity-50"
        />
      ))}
    </div>
  );
}
