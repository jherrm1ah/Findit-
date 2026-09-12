// Pure constants + logic for seller trust/verification — deliberately kept
// free of any server-only import (db, storage, repo) so client components
// can import this file directly (see SellerOnboarding.jsx, SellerProfile.jsx)
// without bundling service-role database code into browser JS. The
// DB-touching half lives in lib/sellerVerification.ts, which imports these
// same definitions rather than duplicating them.

export type SellerType = "physical_store" | "online_business" | "home_based" | "both" | "individual" | "other";
export type VerificationStatus = "incomplete" | "pending" | "approved" | "rejected" | "needs_info";
export type VerificationLevel = "new" | "verified" | "trusted";
export type EvidenceKind = "product_photo" | "shop_photo" | "business_page" | "social_link" | "other";

export const SELLER_TYPES: { value: SellerType; label: string }[] = [
  { value: "physical_store", label: "Physical store" },
  { value: "online_business", label: "Online business" },
  { value: "home_based", label: "Home-based seller" },
  { value: "both", label: "Both physical and online" },
  { value: "individual", label: "Individual seller / reseller" },
  { value: "other", label: "Other" },
];

// Thresholds for "Trusted" — a real, checkable bar, not an admin's whim.
// Kept as constants rather than admin-editable config for now (unlike
// subscription_plans): this is a first cut and deliberately conservative;
// revisit once there's enough real order volume to tune it against.
const TRUSTED_MIN_ORDERS = 10;
const TRUSTED_MIN_RATING = 4;

export const VERIFICATION_LEVEL_COPY: Record<VerificationLevel, { label: string; explanation: string }> = {
  new: {
    label: "New seller",
    explanation: "This seller's account was created but hasn't completed FindIt's verification review yet.",
  },
  verified: {
    label: "Verified seller",
    explanation:
      "FindIt has reviewed this seller's business information and evidence. Verified doesn't guarantee every transaction — always use Pay After Delivery where available.",
  },
  trusted: {
    label: "Trusted seller",
    explanation: `Verified, plus a real track record on FindIt: at least ${TRUSTED_MIN_ORDERS} completed orders, no serious complaints, and a strong buyer rating.`,
  },
};

// Never claim a level we haven't actually earned. "Trusted" requires having
// been reviewed AND approved first; a seller who was never reviewed can
// rack up orders and still won't show as more than "New."
export function computeVerificationLevel(input: {
  verificationStatus: VerificationStatus;
  orderCount: number;
  disputeCount: number;
  avgRating: number | null;
}): VerificationLevel {
  if (input.verificationStatus !== "approved") return "new";
  const ratingOk = input.avgRating === null || input.avgRating >= TRUSTED_MIN_RATING;
  if (input.orderCount >= TRUSTED_MIN_ORDERS && input.disputeCount === 0 && ratingOk) {
    return "trusted";
  }
  return "verified";
}

// The actual minimum bar for "Submit for verification," enforced both here
// (client-side, for the wizard's Continue/Submit buttons) and again
// server-side in lib/sellerVerification.ts#submitVerification — deliberately
// low: one real detail plus one piece of evidence, so a legitimate home-
// based seller with a single product photo and a WhatsApp/Instagram handle
// clears it easily.
export function canSubmitVerification(input: {
  sellerType: string | null;
  category: string | null;
  hasPhysicalStore: boolean | null;
  shopAddress: string | null;
  evidenceCount: number;
}): { ok: true } | { ok: false; reason: string } {
  if (!input.sellerType) return { ok: false, reason: "Choose what type of seller you are." };
  if (!input.category || !input.category.trim()) return { ok: false, reason: "Tell us what you sell." };
  if (input.hasPhysicalStore === null || input.hasPhysicalStore === undefined) {
    return { ok: false, reason: "Let us know whether you have a physical store." };
  }
  if (input.hasPhysicalStore && !input.shopAddress?.trim()) {
    return { ok: false, reason: "Add your shop address — it's only used for verification, never shown publicly." };
  }
  if (input.evidenceCount < 1) {
    return {
      ok: false,
      reason: "Add at least one piece of evidence — a product photo, a shop photo, or a link to your business page.",
    };
  }
  return { ok: true };
}
