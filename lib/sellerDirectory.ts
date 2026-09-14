// The public seller/store directory — every approved seller a buyer can
// browse without already knowing a name or a link, the discovery path
// lib/sellerPublicProfile.ts and /store/[slug] never provided on their own
// (both require the buyer to already have a specific seller in mind).

import { getDb, assertNoError } from "./db";
import { computeVerificationLevel, type VerificationLevel, type VerificationStatus } from "./sellerVerificationLevels";
import { getStorePlanDisplayMap, FREE_STORE_PLAN_ID } from "./subscriptions";

export type PublicSellerSummary = {
  id: string;
  name: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  sellerType: string | null;
  category: string | null;
  location: string | null;
  memberSince: string | null;
  verificationLevel: VerificationLevel;
  proBadge: boolean;
  storeSlug: string | null;
  rating: number | null;
  reviewCount: number;
  completedOrderCount: number;
  activeListingCount: number;
};

type Row = Record<string, unknown>;

type SellerInput = {
  id: string;
  name: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  sellerType: string | null;
  category: string | null;
  location: string | null;
  memberSince: string | null;
  verificationStatus: VerificationStatus;
  storeSlug: string | null;
};

// Pure: combines already-fetched rows into the directory list, so the actual
// decision logic (how a rating rolls up, what counts as "completed") is
// unit-testable without a database.
//
// Deliberately keyed by seller_id throughout, unlike lib/repo.ts's
// getSellerStatsMap (which is keyed by the mutable, collidable business-name
// column because it has to decorate pre-seller_id-era product/order rows).
// Every seller here is a real, approved account with a real id — the whole
// reason seller_id exists (see lib/sellerIdentityMatch.ts) — so this never
// risks merging two same-named sellers' numbers together. The trade-off:
// an order placed before the seller_id backfill (migration 009) has no
// seller_id, so it can't contribute to a rating or completed-order count
// here even though it would on that seller's own profile page. That's a
// minor undercount on old accounts, not a wrong attribution — the safer
// side to be wrong on for a number shown next to someone else's name.
export function buildPublicSellerDirectory(
  sellers: SellerInput[],
  reviewedOrders: Array<{ sellerId: string | null; myRating: number | null }>,
  outcomeOrders: Array<{ sellerId: string | null; escrowStatus: string }>,
  activeListingCounts: Map<string, number>,
  planDisplay: Map<string, { proBadge: boolean; planId: string }>
): PublicSellerSummary[] {
  const ratingSums = new Map<string, { sum: number; count: number }>();
  for (const o of reviewedOrders) {
    if (!o.sellerId || o.myRating == null) continue;
    const agg = ratingSums.get(o.sellerId) ?? { sum: 0, count: 0 };
    agg.sum += o.myRating;
    agg.count += 1;
    ratingSums.set(o.sellerId, agg);
  }

  const completedCounts = new Map<string, number>();
  const disputeCounts = new Map<string, number>();
  for (const o of outcomeOrders) {
    if (!o.sellerId) continue;
    if (o.escrowStatus === "released") completedCounts.set(o.sellerId, (completedCounts.get(o.sellerId) ?? 0) + 1);
    if (o.escrowStatus === "disputed") disputeCounts.set(o.sellerId, (disputeCounts.get(o.sellerId) ?? 0) + 1);
  }

  const summaries = sellers.map((s): PublicSellerSummary => {
    const ratingAgg = ratingSums.get(s.id);
    const rating = ratingAgg ? Number((ratingAgg.sum / ratingAgg.count).toFixed(1)) : null;
    const display = planDisplay.get(s.id);
    return {
      id: s.id,
      name: s.name,
      logoUrl: s.logoUrl,
      bannerUrl: s.bannerUrl,
      sellerType: s.sellerType,
      category: s.category,
      location: s.location,
      memberSince: s.memberSince,
      verificationLevel: computeVerificationLevel({
        verificationStatus: s.verificationStatus,
        orderCount: completedCounts.get(s.id) ?? 0,
        disputeCount: disputeCounts.get(s.id) ?? 0,
        avgRating: rating,
      }),
      proBadge: display?.proBadge ?? false,
      // Same rule as lib/sellerPublicProfile.ts: the slug stays reserved for
      // a downgraded seller, but the directory never advertises a link that
      // would land on a closed store.
      storeSlug: display && display.planId !== FREE_STORE_PLAN_ID ? s.storeSlug : null,
      rating,
      reviewCount: ratingAgg?.count ?? 0,
      completedOrderCount: completedCounts.get(s.id) ?? 0,
      activeListingCount: activeListingCounts.get(s.id) ?? 0,
    };
  });

  // Business/Pro Store plans buy real placement everywhere else a seller
  // appears (products, this directory too) — see sortFeaturedFirst in
  // lib/repo.ts. A stable sort means everything within "pro" and "not pro"
  // keeps the caller's own order (newest-approved-first).
  return summaries
    .map((s, i) => ({ s, i }))
    .sort((a, b) => Number(b.s.proBadge) - Number(a.s.proBadge) || a.i - b.i)
    .map(({ s }) => s);
}

// Only approved sellers — the only ones a buyer can actually transact with.
// A pending seller is still readable at its own direct link (see
// lib/sellerPublicProfile.ts) for an old order that references it, but has
// nothing to sell yet, so listing it in a browsable directory would just be
// a dead end.
export async function listPublicSellerDirectory(): Promise<PublicSellerSummary[]> {
  const db = getDb();
  const [sellersResult, planMap] = await Promise.all([
    db
      .from("sellers")
      .select(
        "id, name, logo_url, banner_url, seller_type, category, public_state, public_city, public_area, verification_status, store_slug, created_at"
      )
      .eq("status", "approved")
      .order("created_at", { ascending: false }),
    getStorePlanDisplayMap(),
  ]);
  const sellerRows = assertNoError(sellersResult, "listing public sellers") as Row[];
  if (sellerRows.length === 0) return [];

  const ids = sellerRows.map((r) => r.id as string);
  const [reviewedResult, outcomeResult, activeProductsResult] = await Promise.all([
    db.from("orders").select("seller_id, my_rating").eq("reviewed", true).in("seller_id", ids),
    db.from("orders").select("seller_id, escrow_status").in("escrow_status", ["released", "disputed"]).in("seller_id", ids),
    db.from("products").select("seller_id").eq("active", true).in("seller_id", ids),
  ]);
  const reviewedRows = assertNoError(reviewedResult, "loading seller reviews") as Row[];
  const outcomeRows = assertNoError(outcomeResult, "loading seller order outcomes") as Row[];
  const productRows = assertNoError(activeProductsResult, "counting active listings") as Row[];

  const activeListingCounts = new Map<string, number>();
  for (const row of productRows) {
    const sellerId = row.seller_id as string;
    activeListingCounts.set(sellerId, (activeListingCounts.get(sellerId) ?? 0) + 1);
  }

  return buildPublicSellerDirectory(
    sellerRows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      logoUrl: (r.logo_url as string | null) ?? null,
      bannerUrl: (r.banner_url as string | null) ?? null,
      sellerType: (r.seller_type as string | null) ?? null,
      category: (r.category as string | null) ?? null,
      location:
        [r.public_area, r.public_city, r.public_state]
          .filter((v): v is string => Boolean(v && String(v).trim()))
          .join(", ") || null,
      memberSince: (r.created_at as string | null) ?? null,
      verificationStatus: r.verification_status as VerificationStatus,
      storeSlug: (r.store_slug as string | null) ?? null,
    })),
    reviewedRows.map((r) => ({
      sellerId: (r.seller_id as string | null) ?? null,
      myRating: (r.my_rating as number | null) ?? null,
    })),
    outcomeRows.map((r) => ({
      sellerId: (r.seller_id as string | null) ?? null,
      escrowStatus: r.escrow_status as string,
    })),
    activeListingCounts,
    planMap
  );
}
