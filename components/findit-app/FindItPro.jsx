"use client";

import { useState } from "react";
import { Crown, Check, Clock, Loader2 } from "lucide-react";
import { naira } from "./data";

// Same honesty rule as StorePlans.jsx: a feature only appears here if it's
// genuinely backed by something real elsewhere in the app. FindIt Pro's
// analytics/customization/featured-listing columns on the plan row are
// shared with Store plans but don't correspond to anything a BUYER can see
// today, so they're deliberately left off this list rather than claimed.
const FEATURE_ROWS = [
  { text: "FindIt Pro badge on your profile", live: true },
  { text: "Priority support", live: false },
];

export default function FindItPro({ findItPro, onSubscribe, onCancel, changing, go }) {
  const [billingPeriod, setBillingPeriod] = useState("monthly");

  if (!findItPro) {
    return (
      <div className="px-5 pt-6 pb-10 flex items-center justify-center min-h-[50vh]">
        <Loader2 size={20} className="animate-spin text-[#7C3AED]" />
      </div>
    );
  }

  const { subscription, plan } = findItPro;
  const isActive = Boolean(subscription && plan);

  // findItPro.plan is only the plan you're CURRENTLY on; the plan to show
  // for subscribing is the one available platform plan today.
  const displayPlan = plan ?? findItPro.plans[0];
  if (!displayPlan) {
    return (
      <div className="px-5 pt-6 pb-10">
        <p className="text-[12px] text-[#6B6483]">FindIt Pro isn&apos;t available right now.</p>
      </div>
    );
  }

  const price = billingPeriod === "yearly" ? displayPlan.priceYearly ?? displayPlan.priceMonthly * 12 : displayPlan.priceMonthly;

  return (
    <div className="px-5 pt-6 pb-10">
      <div className="flex items-center gap-2 mb-1">
        <Crown size={17} className="text-[#7C3AED]" />
        <h1 className="text-[19px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>FindIt Pro</h1>
      </div>
      <p className="text-[12px] text-[#6B6483] mb-5">
        An account-wide membership, separate from a seller&apos;s own Store plan.
      </p>

      <div className="bg-white rounded-[20px] p-4 shadow-sm shadow-[#4C1D95]/5 border-2 border-[#7C3AED]">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#F5F2FC] flex items-center justify-center shrink-0">
              <Crown size={15} className="text-[#7C3AED]" />
            </div>
            <p className="text-[14px] font-bold text-[#1E1B4B]">{displayPlan.name}</p>
          </div>
          {isActive && (
            <span className="text-[10px] font-semibold text-white bg-[#7C3AED] px-2 py-1 rounded-full shrink-0">
              Active
            </span>
          )}
        </div>

        {isActive ? (
          <>
            <p className="text-[11px] text-[#6B6483] my-2">
              Billed {subscription.billingPeriod}
              {subscription.currentPeriodEnd &&
                ` · renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}`}
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5 my-3">
              {["monthly", "yearly"].map((period) => (
                <button
                  key={period}
                  onClick={() => setBillingPeriod(period)}
                  className={`text-[11.5px] font-semibold px-3 py-1.5 rounded-full ${
                    billingPeriod === period ? "text-white" : "text-[#514B67] bg-[#F5F2FC]"
                  }`}
                  style={billingPeriod === period ? { background: "linear-gradient(135deg,#A855F7,#7C3AED)" } : undefined}
                >
                  {period === "monthly" ? "Monthly" : "Yearly"}
                </button>
              ))}
            </div>
            <p className="text-[18px] font-bold text-[#1E1B4B] mb-3">
              {naira(price)}
              <span className="text-[11px] font-medium text-[#8A8372]">/{billingPeriod === "yearly" ? "year" : "month"}</span>
            </p>
          </>
        )}

        <ul className="space-y-1.5 mb-4">
          {FEATURE_ROWS.map((f) => (
            <li key={f.text} className={`flex items-center gap-2 text-[11.5px] ${f.live ? "text-[#514B67]" : "text-[#8A8372]"}`}>
              {f.live ? <Check size={12} className="text-[#10B981] shrink-0" /> : <Clock size={12} className="text-[#B45309] shrink-0" />}
              {f.text}
              {!f.live && <span className="text-[9.5px] font-semibold text-[#B45309] bg-[#F59E0B]/12 px-1.5 py-0.5 rounded-full">Coming soon</span>}
            </li>
          ))}
        </ul>

        {isActive ? (
          <button
            onClick={onCancel}
            disabled={changing}
            className="w-full text-[12px] font-semibold text-[#6B6483] border border-[#ECE9F7] rounded-xl py-2.5 disabled:opacity-50"
          >
            {changing ? "Working…" : "Cancel FindIt Pro"}
          </button>
        ) : (
          <button
            onClick={() => onSubscribe(displayPlan.id, billingPeriod)}
            disabled={changing}
            className={`w-full text-white text-[12.5px] font-semibold py-2.5 rounded-xl ${changing ? "opacity-50" : ""}`}
            style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
          >
            {changing ? "Working…" : `Subscribe — ${naira(price)}/${billingPeriod === "yearly" ? "yr" : "mo"}`}
          </button>
        )}
      </div>

      <button onClick={() => go("profile")} className="mt-6 text-[12px] font-semibold text-[#7C3AED]">
        Back to profile
      </button>
    </div>
  );
}
