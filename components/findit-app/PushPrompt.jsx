"use client";

import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { pushState, turnOnPush, turnOffPush, needsHomeScreenOnIos } from "./push";

// "Get alerts on this phone": turns on notifications that arrive even when
// FindIt is closed. Two looks:
// - "card": a dismissible card (Notifications screen, seller Overview), shown
//   only while alerts are off on this device.
// - "row": a switch for the notification settings screen.
const DISMISS_KEY = "findit_push_prompt_dismissed";

export default function PushPrompt({ variant = "card", forSeller = false, showToast }) {
  const [state, setState] = useState("loading");
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let live = true;
    pushState().then((s) => live && setState(s));
    return () => {
      live = false;
    };
  }, []);

  const turnOn = async () => {
    setBusy(true);
    try {
      const next = await turnOnPush();
      setState(next);
      if (next === "on") showToast?.("Alerts are on for this phone.");
      if (next === "blocked") showToast?.("Alerts are blocked for FindIt in your browser settings.", "error");
    } catch (err) {
      showToast?.(err.message || "Couldn't turn on alerts.", "error");
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setBusy(true);
    await turnOffPush();
    setState("off");
    setBusy(false);
  };

  if (state === "loading") return null;

  if (variant === "row") {
    if (state === "unavailable") {
      return needsHomeScreenOnIos() ? (
        <p className="text-[11.5px] text-[#6B6483] bg-white border border-[#ECE9F7] rounded-[20px] p-4 mt-3">
          To get alerts on an iPhone, add FindIt to your home screen first (Share → Add to Home Screen), then open it from there.
        </p>
      ) : null;
    }
    return (
      <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 mt-3 flex items-center justify-between gap-3">
        <div className="flex-1">
          <p className="text-[13px] font-semibold text-[#1E1B4B]">Alerts on this phone</p>
          <p className="text-[11.5px] text-[#6B6483] mt-0.5">
            {state === "blocked"
              ? "Blocked in your browser settings. Allow notifications for FindIt there to turn them on."
              : "Pop-up alerts for orders, messages and offers, even when FindIt is closed."}
          </p>
        </div>
        {state === "on" && (
          <button
            onClick={async () => {
              const res = await fetch("/api/push/test", { method: "POST" }).catch(() => null);
              const data = res ? await res.json().catch(() => ({})) : {};
              showToast?.(res?.ok ? "Test alert sent. It should pop up in a few seconds." : data.error || "Couldn't send a test.", res?.ok ? undefined : "error");
            }}
            className="text-[11.5px] font-semibold text-[#7C3AED] shrink-0"
          >
            Send a test
          </button>
        )}
        {state !== "blocked" && (
          <button
            onClick={state === "on" ? turnOff : turnOn}
            disabled={busy}
            aria-pressed={state === "on"}
            aria-label={state === "on" ? "Turn off alerts on this phone" : "Turn on alerts on this phone"}
            className="w-11 h-6 rounded-full shrink-0 relative transition-colors disabled:opacity-60"
            style={{ background: state === "on" ? "linear-gradient(135deg,#A855F7,#7C3AED)" : "#E4E1F0" }}
          >
            <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all" style={{ left: state === "on" ? 22 : 2 }} />
          </button>
        )}
      </div>
    );
  }

  if (state !== "off" || dismissed) return null;
  const hide = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // hidden for this visit only
    }
    setDismissed(true);
  };
  return (
    <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 mb-4 flex items-start gap-3 shadow-sm shadow-[#4C1D95]/5">
      <div className="w-9 h-9 rounded-full bg-[#F5F2FC] flex items-center justify-center shrink-0">
        <BellRing size={16} className="text-[#7C3AED]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-[#1E1B4B]">
          {forSeller ? "Never miss an order" : "Get alerts on this phone"}
        </p>
        <p className="text-[11.5px] text-[#6B6483] mt-0.5 mb-2.5">
          {forSeller
            ? "Get a pop-up the moment a buyer pays, even when FindIt is closed."
            : "Know the moment your order moves, a seller replies or an offer comes in."}
        </p>
        <button
          onClick={turnOn}
          disabled={busy}
          className="text-white text-[12px] font-semibold px-4 py-2 rounded-xl disabled:opacity-60"
          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
        >
          {busy ? "Turning on…" : "Turn on alerts"}
        </button>
      </div>
      <button onClick={hide} aria-label="Not now" className="p-1 -m-1 text-[#8A8372]">
        <X size={16} />
      </button>
    </div>
  );
}
