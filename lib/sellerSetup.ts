// The seller setup guide's steps (components/findit-app/SetupGuide.jsx).
// Pure, so it can be tested without rendering anything.

// The steps, worked out from what the seller dashboard already has. Each
// one ticks itself off from the seller's real data.
export type SetupStep = {
  key: string;
  title: string;
  detail: string;
  done: boolean;
  waiting?: boolean;
  action: { label: string; to?: string; tab?: string; addListing?: boolean } | null;
};

export function setupSteps({
  user,
  storeBranding,
  verification,
  myListings,
  payoutAccount,
  myOrders,
}: {
  user?: { avatarUrl?: string | null } | null;
  storeBranding?: { logoUrl?: string | null } | null;
  verification?: { status?: string } | null;
  myListings?: unknown[];
  payoutAccount?: { hasAccount?: boolean } | null;
  myOrders?: { paymentStatus?: string; status?: string }[];
}): SetupStep[] {
  const verificationStatus = verification?.status ?? "approved";
  return [
    {
      key: "photo",
      title: "Add a profile photo or logo",
      detail: "Buyers trust a face or a logo. It shows on your listings, your profile and in messages.",
      done: Boolean(user?.avatarUrl || storeBranding?.logoUrl),
      action: { label: "Add photo", to: "profile" },
    },
    {
      key: "verify",
      title: "Get verified",
      detail:
        verificationStatus === "pending"
          ? "Submitted. FindIt is reviewing it, and you'll get a notification when it's done."
          : verificationStatus === "rejected" || verificationStatus === "needs_info"
            ? "FindIt needs a little more from you before you're verified."
            : "Verified sellers get a badge and more buyers. It takes a few minutes.",
      done: verificationStatus === "approved",
      waiting: verificationStatus === "pending",
      action: verificationStatus === "pending" ? null : { label: verificationStatus === "incomplete" ? "Start verification" : "Fix and resubmit", to: "sellerOnboarding" },
    },
    {
      key: "listing",
      title: "Add your first listing",
      detail: "Clear photos, a fair price and your delivery fee. It goes live as soon as you save it.",
      done: (myListings?.length ?? 0) > 0,
      action: { label: "Add listing", tab: "listings", addListing: true },
    },
    {
      key: "delivery",
      title: "Set delivery pricing",
      detail:
        "Choose free shipping (delivery included in your price), a fixed fee, or fees by state for each listing, so buyers see the real cost.",
      done:
        (myListings?.length ?? 0) > 0 &&
        (myListings ?? []).every((p) => {
          const l = p as { deliveryOption?: string | null; deliveryPricing?: string | null };
          return l.deliveryOption === "Pickup" || Boolean(l.deliveryPricing);
        }),
      action: { label: "Set delivery pricing", tab: "listings" },
    },
    {
      key: "payout",
      title: "Add your bank account",
      detail: "So FindIt can pay you. Your money is released here as soon as a buyer confirms delivery.",
      done: Boolean(payoutAccount?.hasAccount),
      action: { label: "Add bank account", tab: "store" },
    },
    {
      key: "sale",
      title: "Make your first sale",
      detail: "Share your listings, and answer customer requests: sellers who reply fast win more orders.",
      done: (myOrders ?? []).some((o) => o.paymentStatus === "paid" && o.status !== "Cancelled"),
      action: { label: "See customer requests", tab: "requests" },
    },
  ];
}

