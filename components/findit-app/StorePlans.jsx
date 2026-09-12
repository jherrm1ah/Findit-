"use client";

import { useState } from "react";
import { Check, Clock, Crown, Store, Loader2 } from "lucide-react";
import { naira } from "./data";

const TIER_ICONS = { store_free: Store, store_basic: Store, store_business: Store, store_pro: Crown };

// Every row here is either live today (real, backend-enforced functionality
// — see the dashboard's Store analytics/branding cards and the public
// storefront) or explicitly marked "Coming soon." Nothing is listed as
// included that a seller can't actually see or use once they upgrade —
// storage limits aren't metered anywhere yet, so that claim isn't made at
// all rather than shown as delivered.
const FEATURE_ROWS = (plan) =>
  [
    plan.productLimit === null
      ? { text: "Unlimited active products", live: true }
      : { text: `Up to ${plan.productLimit} active products`, live: true },
    plan.analyticsLevel !== "none" ? { text: `${cap(plan.analyticsLevel)} store analytics`, live: true } : null,
    plan.customizationLevel !== "none" ? { text: "Store logo & banner customization", live: true } : null,
    plan.featuredListingAccess ? { text: "Featured placement on Home & Browse", live: true } : null,
    plan.proBadge ? { text: "Pro Store badge", live: true } : null,
    plan.prioritySupport ? { text: "Priority support", live: false } : null,
  ].filter(Boolean);

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// The exact progression from the spec: what upgrading each tier is FOR, not
// just what it unlocks.
const TIER_TAGLINE = {
  store_free: "Start selling",
  store_basic: "Build your store",
  store_business: "Grow your business",
  store_pro: "Scale your business",
};

export default function StorePlans({ storePlan, onChangePlan, onCancelPlan, changing, go }) {
  const [pendingPlanId, setPendingPlanId] = useState(null);

  if (!storePlan) {
    return (
      <div className="px-5 pt-6 pb-10 flex items-center justify-center min-h-[50vh]">
        <Loader2 size={20} className="animate-spin text-[#7C3AED]" />
      </div>
    );
  }

  const { plan: currentPlan, plans, usage } = storePlan;

  const choose = async (planId) => {
    setPendingPlanId(planId);
    try {
      await onChangePlan(planId, "monthly");
    } finally {
      setPendingPlanId(null);
    }
  };

  return (
    <div className="px-5 pt-6 pb-10">
      <div className="flex items-center gap-2 mb-1">
        <Store size={17} className="text-[#7C3AED]" />
        <h1 className="text-[19px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>Store plans</h1>
      </div>
      <p className="text-[12px] text-[#6B6483] mb-1">
        You&apos;re on <span className="font-semibold text-[#1E1B4B]">{currentPlan.name}</span> — {usage.label}.
      </p>
      {storePlan.subscription.status === "trialing" && (
        <p className="text-[11px] text-[#B45309] mb-5">
          Trial active until {new Date(storePlan.subscription.trialEndsAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}.
        </p>
      )}
      {storePlan.subscription.status !== "trialing" && <div className="mb-5" />}

      <div className="space-y-3">
        {plans.map((plan) => {
          const Icon = TIER_ICONS[plan.id] || Store;
          const isCurrent = plan.id === currentPlan.id;
          const isBusy = changing && pendingPlanId === plan.id;
          return (
            <div
              key={plan.id}
              className={`bg-white rounded-[20px] p-4 shadow-sm shadow-[#4C1D95]/5 border-2 ${
                isCurrent ? "border-[#7C3AED]" : "border-[#ECE9F7]"
              }`}
            >
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#F5F2FC] flex items-center justify-center shrink-0">
                    <Icon size={15} className="text-[#7C3AED]" />
                  </div>
                  <div>
                    <p className="text-[14px] font-bold text-[#1E1B4B]">{plan.name}</p>
                    <p className="text-[10.5px] text-[#8A8372] uppercase tracking-wide">{TIER_TAGLINE[plan.id]}</p>
                  </div>
                </div>
                {isCurrent && (
                  <span className="text-[10px] font-semibold text-[#7C3AED] bg-[#7C3AED]/10 px-2 py-1 rounded-full shrink-0">
                    Current plan
                  </span>
                )}
              </div>

              <p className="text-[18px] font-bold text-[#1E1B4B] my-2">
                {plan.priceMonthly === 0 ? "Free" : naira(plan.priceMonthly)}
                {plan.priceMonthly > 0 && <span className="text-[11px] font-medium text-[#8A8372]">/month</span>}
              </p>

              <ul className="space-y-1.5 mb-3">
                {FEATURE_ROWS(plan).map((f) => (
                  <li key={f.text} className={`flex items-center gap-2 text-[11.5px] ${f.live ? "text-[#514B67]" : "text-[#8A8372]"}`}>
                    {f.live ? (
                      <Check size={12} className="text-[#10B981] shrink-0" />
                    ) : (
                      <Clock size={12} className="text-[#B45309] shrink-0" />
                    )}
                    {f.text}
                    {!f.live && <span className="text-[9.5px] font-semibold text-[#B45309] bg-[#F59E0B]/12 px-1.5 py-0.5 rounded-full">Coming soon</span>}
                  </li>
                ))}
              </ul>

              {!isCurrent && (
                <button
                  onClick={() => choose(plan.id)}
                  disabled={changing}
                  className={`w-full text-white text-[12.5px] font-semibold py-2.5 rounded-xl ${changing ? "opacity-50" : ""}`}
                  style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
                >
                  {isBusy ? "Working…" : plan.sortOrder > currentPlan.sortOrder ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`}
                </button>
              )}
              {isCurrent && plan.priceMonthly > 0 && (
                <button
                  onClick={onCancelPlan}
                  disabled={changing}
                  className="w-full text-[12px] font-semibold text-[#6B6483] border border-[#ECE9F7] rounded-xl py-2.5 disabled:opacity-50"
                >
                  Cancel — back to Free
                </button>
              )}
            </div>
          );
        })}
      </div>

      <button onClick={() => go("seller")} className="mt-6 text-[12px] font-semibold text-[#7C3AED]">
        Back to dashboard
      </button>
    </div>
  );
}
