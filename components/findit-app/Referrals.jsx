"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Gift, Copy, Check, Share2, Users, Clock, Trophy, Loader2 } from "lucide-react";
import { api } from "./api";
import { STAGGER_CONTAINER, STAGGER_ITEM, press } from "./motion";

// "What counts as successful" is admin-configurable (lib/referrals.ts) and
// deliberately never a monetary amount yet — this copy describes the
// mechanism honestly rather than promising a specific reward this screen
// can't actually back up.
const QUALIFYING_ACTION_COPY = {
  registration: "they create a FindIt account",
  first_purchase: "they complete their first purchase",
  seller_verification: "they get verified as a seller",
  first_product: "they publish their first listing",
};

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="flex-1 bg-white border border-[#ECE9F7] rounded-2xl p-3.5 text-center">
      <Icon size={16} className="text-[#7C3AED] mx-auto mb-1.5" />
      <p className="text-[18px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>{value}</p>
      <p className="text-[10.5px] text-[#6B6483] leading-tight mt-0.5">{label}</p>
    </div>
  );
}

export default function Referrals({ showToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .getReferralDashboard()
      .then(setData)
      .catch((err) => setError(err.message || "Couldn't load your referral dashboard."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="px-5 pt-16 flex flex-col items-center text-center">
        <Loader2 size={20} className="text-[#7C3AED] animate-spin" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="px-5 pt-16 text-center">
        <p className="text-[13px] text-[#6B6483]">{error || "Couldn't load your referral dashboard."}</p>
      </div>
    );
  }

  const link = `${window.location.origin}${data.referralPath}`;
  const shareText = `Join me on FindIt — a marketplace where you request what you need and real sellers come to you: ${link}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast?.("Couldn't copy the link — try again.", "error");
    }
  };

  const shareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noopener,noreferrer");
  };

  const shareNative = async () => {
    try {
      await navigator.share({ title: "Join me on FindIt", text: shareText, url: link });
    } catch {
      // Cancelled or unsupported — no error toast, this is a normal outcome.
    }
  };

  return (
    <motion.div className="px-5 pt-6 pb-10" initial="hidden" animate="visible" variants={STAGGER_CONTAINER}>
      <motion.div variants={STAGGER_ITEM} className="flex items-center gap-2 mb-1">
        <Gift size={18} className="text-[#7C3AED]" />
        <h1 className="text-[20px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>Refer & earn</h1>
      </motion.div>
      <motion.p variants={STAGGER_ITEM} className="text-[12px] text-[#6B6483] mb-5">
        Invite friends to FindIt. A referral counts once {QUALIFYING_ACTION_COPY[data.activeQualifyingAction] ?? "they complete a qualifying action"} — not just for signing up.
      </motion.p>

      <motion.div variants={STAGGER_ITEM} className="flex gap-2.5 mb-5">
        <StatCard icon={Users} label="People referred" value={data.totalReferred} />
        <StatCard icon={Trophy} label="Successful" value={data.successfulReferrals} />
        <StatCard icon={Clock} label="Pending" value={data.pendingReferrals} />
      </motion.div>

      <motion.div variants={STAGGER_ITEM} className="bg-white border border-[#ECE9F7] rounded-2xl p-4 mb-5">
        <p className="text-[11px] uppercase tracking-wide text-[#8A8372] mb-2">Your referral link</p>
        <div className="flex items-center gap-2 bg-[#F5F2FC] rounded-xl px-3 py-2.5 mb-3">
          <p className="flex-1 text-[12.5px] text-[#1E1B4B] truncate">{link}</p>
        </div>
        <div className="flex gap-2">
          <motion.button
            onClick={copyLink}
            {...press}
            className="flex-1 flex items-center justify-center gap-1.5 text-[12.5px] font-semibold py-2.5 rounded-xl border border-[#ECE9F7] text-[#1E1B4B]"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
          </motion.button>
          <motion.button
            onClick={shareWhatsApp}
            {...press}
            className="flex-1 flex items-center justify-center gap-1.5 text-[12.5px] font-semibold py-2.5 rounded-xl text-white"
            style={{ background: "#25D366" }}
          >
            WhatsApp
          </motion.button>
          {typeof navigator !== "undefined" && navigator.share && (
            <motion.button
              onClick={shareNative}
              {...press}
              aria-label="Share"
              className="w-11 shrink-0 flex items-center justify-center rounded-xl text-white"
              style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
            >
              <Share2 size={15} />
            </motion.button>
          )}
        </div>
      </motion.div>

      {data.rewardsEarned > 0 && (
        <motion.div variants={STAGGER_ITEM} className="bg-[#FBF0E2] border border-[#EFD6AE] rounded-2xl px-4 py-3.5">
          <p className="text-[12.5px] font-semibold text-[#B45309]">{data.rewardsEarned} reward{data.rewardsEarned === 1 ? "" : "s"} earned</p>
          <p className="text-[11.5px] text-[#8A6A3A] mt-0.5">
            {data.rewardsClaimed} claimed so far. FindIt hasn't activated a reward campaign yet — your earned slots are saved and will be honored once one launches.
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
