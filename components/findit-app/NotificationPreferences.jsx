"use client";

import { useState } from "react";

export default function NotificationPreferences({ user, onToggle, showToast }) {
  const [enabled, setEnabled] = useState(user.notificationsEnabled);
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    if (saving) return;
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    try {
      await onToggle(next);
    } catch (err) {
      setEnabled(!next);
      showToast?.(err.message || "Couldn't update your preference.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-5 pt-6 pb-10">
      <h1 className="text-[19px] font-bold text-[#1E1B4B] mb-1" style={{ fontFamily: "Fraunces, serif" }}>
        Notification preferences
      </h1>
      <p className="text-[12px] text-[#6B6483] mb-6">Control whether FindIt sends you in-app notifications.</p>

      <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 flex items-center justify-between gap-3">
        <div className="flex-1">
          <p className="text-[13px] font-semibold text-[#1E1B4B]">Order & offer updates</p>
          <p className="text-[11.5px] text-[#6B6483] mt-0.5">
            Order status changes, new offers on your requests, reviews, and seller approvals.
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={saving}
          aria-label={enabled ? "Turn off notifications" : "Turn on notifications"}
          aria-pressed={enabled}
          className="w-11 h-6 rounded-full shrink-0 relative transition-colors disabled:opacity-60"
          style={{ background: enabled ? "linear-gradient(135deg,#A855F7,#7C3AED)" : "#E4E1F0" }}
        >
          <span
            className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
            style={{ left: enabled ? "22px" : "2px" }}
          />
        </button>
      </div>

      {!enabled && (
        <p className="text-[11.5px] text-[#8A8372] mt-3 px-1">
          You'll still see your orders and requests as normal — you just won't get new notification alerts for them.
        </p>
      )}
    </div>
  );
}
