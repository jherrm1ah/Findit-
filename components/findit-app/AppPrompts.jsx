"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Star, Download, X } from "lucide-react";
import { inFindItApp, playStoreLive, PLAY_STORE_URL, appVersion, compareVersions, remember } from "./nativeApp";

const DAY = 24 * 60 * 60 * 1000;
// The newest Android version on the Play Store. Set NEXT_PUBLIC_ANDROID_LATEST_VERSION in Vercel
// when a new version is published there, and older apps show "Update available".
const LATEST = process.env.NEXT_PUBLIC_ANDROID_LATEST_VERSION || "";

// Only in the Android app, and only once FindIt is live on Google Play.
function promptsEnabled() {
  return inFindItApp() && playStoreLive();
}

// Asks for a Play Store rating right after a buyer confirms a delivery (a happy moment).
// Once rated it never asks again; "Not now" waits 30 days.
export function shouldAskForRating() {
  if (!promptsEnabled()) return false;
  if (remember("rated") === "1") return false;
  const later = Number(remember("rateLaterAt") || 0);
  return !later || Date.now() - later > 30 * DAY;
}

export function RatePrompt({ open, onClose }) {
  const rate = () => {
    remember("rated", "1");
    window.open(PLAY_STORE_URL, "_blank", "noopener,noreferrer");
    onClose();
  };
  const later = () => {
    remember("rateLaterAt", Date.now());
    onClose();
  };
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/30"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={later}
        >
          <motion.div
            className="w-full max-w-md bg-white rounded-t-[24px] p-5 pb-8"
            initial={{ y: 40 }}
            animate={{ y: 0 }}
            exit={{ y: 40 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Rate FindIt"
          >
            <div className="flex justify-center gap-1 mb-3 text-[#F59E0B]">
              {[0, 1, 2, 3, 4].map((i) => <Star key={i} size={22} fill="currentColor" />)}
            </div>
            <p className="text-center text-[16px] font-bold text-[#1E1B4B]">Enjoying FindIt?</p>
            <p className="text-center text-[12.5px] text-[#514B67] mt-1 mb-4">
              A quick rating on Google Play helps other buyers and sellers find us.
            </p>
            <button
              onClick={rate}
              className="w-full text-[13px] font-semibold text-white py-3 rounded-xl"
              style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
            >
              Rate FindIt
            </button>
            <button onClick={later} className="w-full text-[12.5px] font-semibold text-[#514B67] py-3 mt-1">
              Not now
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// A slim banner when the installed app is older than the newest Play Store version.
// Dismissing hides it for 3 days.
export function UpdateBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!promptsEnabled() || !LATEST) return;
    const dismissed = Number(remember("updateDismissedAt") || 0);
    if (dismissed && Date.now() - dismissed < 3 * DAY) return;
    let live = true;
    appVersion().then((v) => {
      if (live && v && compareVersions(v, LATEST) < 0) setShow(true);
    });
    return () => {
      live = false;
    };
  }, []);
  if (!show) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-[70] flex justify-center px-3 pt-2 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-md flex items-center gap-2 bg-[#1E1B4B] text-white rounded-2xl px-3 py-2.5 shadow-lg">
        <Download size={16} className="shrink-0" />
        <p className="flex-1 text-[12px] leading-snug">A new version of FindIt is available.</p>
        <button
          onClick={() => window.open(PLAY_STORE_URL, "_blank", "noopener,noreferrer")}
          className="text-[12px] font-semibold bg-white text-[#1E1B4B] rounded-lg px-3 py-1.5"
        >
          Update
        </button>
        <button
          aria-label="Dismiss"
          onClick={() => {
            remember("updateDismissedAt", Date.now());
            setShow(false);
          }}
          className="p-1 opacity-80"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
