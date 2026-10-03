// FindIt Pro's purchase discount — split out of lib/subscriptions.ts (which
// imports lib/db.ts, explicitly server-only) so this one pure calculation
// can also be imported directly by a "use client" component. Before this
// existed as its own file, SellerDashboard.jsx's display-only price mirror
// (proDisplayPrice) couldn't import the real function without pulling
// server-only code into the client bundle, so it hardcoded the same 20% as
// a bare 8000/10000 — a second, driftable copy of this exact number.
//
// FindIt Pro's own value, distinct from anything a Store plan already
// gives — see FindItPro.jsx's FEATURE_ROWS for the matching buyer-facing
// claim. Before this, FindIt Pro's only two perks (badge + priority
// support) were both ALSO bundled into Pro Store, so any seller already on
// Pro Store got Pro's entire value for free — nothing Pro-specific to pay
// for. A 20% discount on Boost/Ad Campaign purchases (lib/boosts.ts,
// lib/adCampaigns.ts) stacks on top of every Store tier instead of
// competing with them, the same way the ad-free Home carousel
// (app/api/ad-campaigns/active) is a buyer-side perk no Store plan could
// ever contain.
export const PRO_PURCHASE_DISCOUNT_BPS = 2000;

// Pure — rounds to the nearest naira, same as every other price this app
// computes. Applied at checkout time (never stored on the plan itself,
// which stays the real, undiscounted price an admin configured) so a
// seller's FindIt Pro status at the MOMENT of purchase decides the price,
// not a stale snapshot.
export function applyProPurchaseDiscount(priceNaira: number, isFindItPro: boolean): number {
  if (!isFindItPro) return priceNaira;
  return Math.round((priceNaira * (10000 - PRO_PURCHASE_DISCOUNT_BPS)) / 10000);
}
