import { getDb, assertNoError } from "./db";
import { MAX_PRODUCT_DESCRIPTION_LENGTH } from "./productLimits";
import {
  recordCompletedTransaction,
  markTransactionDisputed,
  markTransactionRefunded,
  markTransactionDisputeResolved,
} from "./transactionRecord";
import { ValidationError } from "./errors";
import {
  assertCanActivateProduct,
  assertCanCustomizeStore,
  assertCanUseStoreTemplate,
  assertCanUseStoreAccent,
  getStorePlanDisplayMap,
} from "./subscriptions";
import { computeVerificationLevel, VerificationLevel, VerificationStatus } from "./sellerVerificationLevels";
import { isValidCategoryKey } from "./categoryCatalog";
import { sellersToNotifyForNewRequest, type RequestNotifyCandidate } from "./requestMatching";
import { recordReview } from "./reviews";
import { listActiveModerationRules, findMatchingModerationRule } from "./moderationRules";
import { qualifyReferral } from "./referrals";
import { publicSellerPicture, avatarsByUserId } from "./sellerPicture";
import { sendPushToUser, sendTextAlert } from "./outsideAlerts";
import { quoteOrderShipping, pickupLocationsForSeller, shippingSummaries, assertProfileBelongsTo, type SellerLocation } from "./shipping/store";
import type { ShippingOption } from "./shipping/engine";
import { recordShipmentEvent, shipmentsForOrders, type ShipmentView, type TrackingInput } from "./shipping/shipments";
import { deliveryChoices, normalizeAddress, normalizeDeliveryPricing, orderPriceFor, parseDeliveryFee, type DeliveryAddress, type DeliveryPricing, type DeliveryRates, type DeliveryMethod, type DeliveryOptions } from "./delivery";

// Re-exported for backward compatibility — every other module in this app
// imports ValidationError from here (its original home); see lib/errors.ts
// for why the class itself now lives there.
export { ValidationError };

function randomId(prefix: string): string {
  return (
    prefix +
    Date.now().toString(36).toUpperCase() +
    Math.random().toString(36).slice(2, 8).toUpperCase()
  );
}

type Row = Record<string, unknown>;

export type Product = {
  id: string;
  category: string;
  name: string;
  price: number;
  seller: string;
  // Reliable identity alongside the text name above — see migration 009 and
  // lib/sellerIdentityMatch.ts. Null until backfilled/dual-written; not read
  // by any user-facing logic yet.
  sellerId: string | null;
  imageUrl: string | null;
  art: number;
  createdAt: string;
  // Real coordinates captured from the seller's location when the listing
  // was created (see lib/geo.ts for how these get used) — null if the
  // seller had no location on file yet.
  lat: number | null;
  lng: number | null;
  // Computed at read time from the seller's real account/order history —
  // not stored on the product row. See getSellerStatsMap().
  verified: boolean;
  rating: number | null;
  // false only when a Store subscription downgrade pushed this listing over
  // the new plan's product limit (see lib/subscriptions.ts) — the listing
  // still exists with all its data, it's just hidden from buyers until the
  // seller upgrades again or another listing is deactivated in its place.
  active: boolean;
  // Real, server-computed Store subscription benefits — see SellerStats in
  // the Products section below. All derived from the seller's LIVE plan at
  // read time, never from anything a client sent.
  sellerProBadge: boolean; // Pro Store plan only
  sellerFeatured: boolean; // Business/Pro — real placement boost, see listProducts()
  sellerLogoUrl: string | null; // set only when the seller's plan allows branding
  sellerBannerUrl: string | null;
  // Seller trust & verification — see computeVerificationLevel in
  // lib/sellerVerificationLevels.ts. sellerLocation is the coarse, public-
  // safe area a seller entered during verification (never the private
  // shop address); null until they've submitted it.
  sellerVerificationLevel: VerificationLevel;
  sellerLocation: string | null;
  sellerMemberSince: string | null;
  // Null = not currently boosted. A real Paystack-paid promotion (see
  // lib/boosts.ts) — see isBoostActive/sortForDisplay below for how this
  // affects display order.
  boostedUntil: string | null;

  // ---- Migration 026: a real listing, not just name/category/price ----
  description: string | null;
  condition: "New" | "Used" | null;
  qty: number;
  // Free-text pickup/delivery-area note — see the migration for why this is
  // distinct from lat/lng above (the seller ACCOUNT's location).
  location: string | null;
  deliveryOption: "Delivery" | "Pickup" | "Both" | null;
  // Migration 043: what the seller charges to deliver it (0 = free). Only
  // used when deliveryOption allows delivery; added to the order's price
  // when the buyer chooses delivery at checkout (see lib/delivery.ts).
  deliveryFee: number;
  // Migration 046: how delivery is priced (lib/deliveryShared.ts): "free"
  // (included in the price), "fixed" (deliveryFee everywhere) or "location"
  // (deliveryRates per state, deliveryFee for every other state). Null = an
  // older listing whose seller hasn't chosen yet.
  deliveryPricing: DeliveryPricing | null;
  deliveryRates: DeliveryRates | null;
  // Migration 047: the package (for weight-based rates and carriers) and the
  // shipping profile that prices delivery (null = its own pricing above, or
  // the seller's default profile). shippingSummary is how delivery reads on
  // the product page ("Free delivery over ₦50,000"); only set on lists.
  weightG: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  shippingProfileId: string | null;
  shippingSummary?: string;
  color: string | null;
  variation: string | null;
  // Every photo, cover first — imageUrl above always equals images[0] and
  // is kept for every existing single-photo reader (ArtBlock and everything
  // built on it). listProducts()/listPublicProductsForSeller() bulk-load
  // this the same way getSellerStatsMap bulk-loads seller stats — one extra
  // query for the whole page, not one per product — because ProductDetail
  // is opened from whichever already-loaded list the buyer tapped, not a
  // fresh per-product fetch; see productImagesForIds below.
  images: string[];

  // ---- Migration 027: product moderation ----
  // Deliberately separate from `active` above, which means something else
  // entirely (a Store-plan downgrade hiding excess listings) — see the
  // migration for why collapsing the two would make "why is this hidden?"
  // ambiguous. 'under_review' is a soft flag (a buyer report or a 'flag'
  // moderation rule) that does not hide the listing; 'removed' is an
  // admin's own decision and does. See lib/productReports.ts.
  moderationStatus: "active" | "under_review" | "removed";
  moderationReason: string | null;
};

export type Order = {
  id: string;
  userId: string;
  item: string;
  seller: string;
  // Reliable identity alongside the text name above — see migration 009 and
  // lib/sellerIdentityMatch.ts. Null until backfilled/dual-written.
  sellerId: string | null;
  price: number;
  status: string;
  canReview: boolean;
  reviewed: boolean;
  myRating: number | null;
  reviewComment: string | null;
  requestId: string | null;
  createdAt: string;
  buyerConfirmedAt: string | null;
  // See migration 039 — when this order first reached 'Dispatched'. The
  // anchor lib/repo.ts#autoReleaseStaleDeliveries counts its 7-day window
  // from; null until the seller dispatches.
  dispatchedAt: string | null;
  escrowStatus: EscrowStatus;
  issueReportedAt: string | null;
  issueNote: string | null;
  // Real payment tracking (migration 016) — see lib/payments.ts. Distinct
  // from escrowStatus, which describes where already-collected money sits;
  // this is whether THIS order has actually been paid for at all.
  paymentStatus: PaymentStatus;
  paidAt: string | null;
  // Snapshotted once at payment confirmation — never recomputed from a
  // later fee change. Null until paymentStatus === "paid".
  platformFeeBps: number | null;
  platformFeeAmount: number | null;
  sellerPayoutAmount: number | null;
  // Snapshot of how much FindIt referral credit reduced what the buyer
  // actually paid via Paystack (migration 036) — display/audit only, never
  // part of the fee split above. 0 until paymentStatus === "paid"; never
  // negative, never more than price.
  creditApplied: number;

  // ---- Migration 043: delivery at checkout (see lib/delivery.ts) ----
  // price above is what the buyer pays: itemPrice + deliveryFee.
  itemPrice: number;
  // The choices the buyer has (copied from the listing/offer; null = either).
  deliveryOptions: DeliveryOptions | null;
  // What delivery costs IF chosen.
  deliveryFeeQuote: number;
  // What the buyer chose; null until they reach checkout.
  deliveryMethod: DeliveryMethod | null;
  deliveryFee: number;
  // Where to deliver. Only shown to the seller once the order is paid
  // (see listOrders) — the buyer always sees their own.
  deliveryAddress: DeliveryAddress | null;
  // True once the buyer has started paying: the method (and so the price)
  // can no longer change. The address still can, until the order is paid.
  deliveryLocked: boolean;
  // Migration 046: delivery fee per state (deliveryFeeQuote for every other
  // state). Null = one fee everywhere. See lib/deliveryShared.ts#feeForState.
  deliveryRates: DeliveryRates | null;
  // True when the order came from a listing whose seller never chose how to
  // price delivery: no fee is charged, and checkout says so.
  deliveryFeeUnset: boolean;
  // Migration 047: the delivery option chosen at checkout (method, name,
  // estimate, zone), or the pickup location; frozen with the price.
  shippingOption: (ShippingOption & { address?: { state?: string; area?: string } }) | null;
  pickupLocation: PickupSnapshot | null;
  pickupStatus: "awaiting" | "ready" | "collected" | null;
  packageWeightG: number | null;
  // The parcel and its tracking history, on lists (listOrders). Null when
  // nothing has been sent yet, or not loaded.
  shipment?: ShipmentView | null;
  // The buyer's name, on a PAID order the seller is looking at (listOrders).
  // Null everywhere else.
  buyerName: string | null;

  // ---- Migration 044 ----
  // The products in this order (a cart becomes one order per seller). Empty
  // for an accepted request offer, and for orders from before 044.
  lines: OrderLine[];
  // Set when an unpaid order is cancelled by the buyer or closed after
  // UNPAID_ORDER_DAYS (status 'Cancelled').
  cancelledAt: string | null;
  cancelReason: "buyer" | "expired" | "account_deleted" | null;
};

export type OrderLine = { productId: string; name: string; qty: number; unitPrice: number };
export type PickupSnapshot = { id: string; name: string; address: string; area: string; state: string; phone: string | null; hours: string | null; instructions: string | null };

export type EscrowStatus = "unpaid" | "held" | "released" | "disputed" | "refunded";
export type PaymentStatus = "pending" | "paid" | "failed";

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  unread: boolean;
  time: string;
};

export type SellerStatus = "pending" | "approved" | "rejected" | "suspended";

export type Seller = {
  id: string;
  userId: string;
  name: string;
  phone: string | null;
  status: SellerStatus;
  statusReason: string | null;
  // The seller's dedicated storefront slug, for the admin Sellers list. Admin
  // only — the public DTO decides separately whether a buyer sees this, since
  // a lapsed plan closes the page while the slug stays reserved. See
  // lib/store.ts.
  storeSlug: string | null;
  storeSlugClaimedAt: string | null;
  createdAt: string;
};

export type Offer = {
  id: string;
  requestId: string;
  seller: string;
  price: number;
  delivery: string;
  eta: string;
  condition: string;
  warranty: string;
  note: string | null;
  // Migration 043: structured delivery terms (null option = older offer,
  // the buyer may choose either with no fee).
  deliveryOption: DeliveryOptions | null;
  deliveryFee: number;
  accepted: boolean;
  createdAt: string;
  // Computed the same way as Product.verified/rating.
  verified: boolean;
  rating: number | null;
};

export type RequestRow = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  category: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  qty: number;
  location: string | null;
  lat: number | null;
  lng: number | null;
  condition: string;
  status: string;
  createdAt: string;
  posted: string;
  offerCount: number;
  // Only populated by listOpenRequests (the seller/admin-facing queue) —
  // a buyer viewing their own requests already knows it's them.
  customerName?: string | null;
  // Whether the CALLING seller specifically has already sent an offer on
  // this request — distinct from offerCount, which is every seller's
  // offers combined. Only populated by listOpenRequests when called with a
  // sellerId; see that function for why the two must never be conflated.
  myOfferSent?: boolean;
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/* ------------------------------------------------------------------ */
/*  Real seller stats — replaces the old fake per-product/per-offer     */
/*  rating/verified/orders-count fields. Computed from the seller's     */
/*  real approval status (sellers.status) and real order reviews.       */
/* ------------------------------------------------------------------ */

type BaseSellerStats = { verified: boolean; rating: number | null; orderCount: number };

type SellerStats = BaseSellerStats & {
  // Live Store-subscription-derived display fields — computed server-side
  // from the seller's current plan (see getStorePlanDisplayMap in
  // lib/subscriptions.ts), never accepted from a client. A seller whose
  // plan lapses stops showing these on their very next listing read, same
  // as their own dashboard.
  proBadge: boolean;
  featured: boolean;
  logoUrl: string | null;
  bannerUrl: string | null;
  // Seller trust & verification (migration 012) — see
  // lib/sellerVerification.ts#computeVerificationLevel. Never claims
  // Verified/Trusted without a real admin review behind it.
  verificationLevel: VerificationLevel;
  publicLocation: string | null;
  memberSince: string | null;
};

// Pure — takes already-fetched rows and computes the stats map. Split out
// from getSellerStatsMap() so this (the actual business logic: how a
// seller's rating and verified badge are derived) can be unit-tested without
// a database, the same way it would be tested if it read from a real
// Supabase project.
export function computeSellerStatsMap(
  sellerRows: Array<{ name: string; status: string }>,
  reviewedOrderRows: Array<{ seller: string; my_rating: number | null }>
): Map<string, BaseSellerStats> {
  const map = new Map<string, BaseSellerStats>();

  for (const row of sellerRows) {
    map.set(row.name, { verified: row.status === "approved", rating: null, orderCount: 0 });
  }

  const ratingSums = new Map<string, { sum: number; count: number }>();
  for (const row of reviewedOrderRows) {
    if (row.my_rating == null) continue;
    const agg = ratingSums.get(row.seller) ?? { sum: 0, count: 0 };
    agg.sum += row.my_rating;
    agg.count += 1;
    ratingSums.set(row.seller, agg);
  }
  for (const [seller, agg] of ratingSums) {
    const existing = map.get(seller) ?? { verified: false, rating: null, orderCount: 0 };
    existing.rating = Number((agg.sum / agg.count).toFixed(1));
    existing.orderCount = agg.count;
    map.set(seller, existing);
  }

  return map;
}

// seller_id is what actually keys getStorePlanDisplayMap (it's a real FK,
// not a mutable text name) — but computeSellerStatsMap above is keyed by
// business_name, the same pre-existing convention every other seller-facing
// read in this app still uses. If two different seller accounts share a
// name (the exact scenario migration 009 exists for), the last one wins
// here too — an existing limitation of name-keyed stats, not a new one.
async function getSellerStatsMap(): Promise<Map<string, SellerStats>> {
  const db = getDb();

  const sellersResult = await db
    .from("sellers")
    .select("id, user_id, name, status, logo_url, banner_url, verification_status, public_state, public_city, public_area, created_at");
  const sellerRows = assertNoError(sellersResult, "loading sellers") as Row[];
  // Each seller's own profile photo, shown wherever they have no store logo (see sellerPicture.ts).
  const avatars = await avatarsByUserId(db, sellerRows.map((r) => r.user_id as string | null));

  const ordersResult = await db
    .from("orders")
    .select("seller, my_rating, reviewed")
    .eq("reviewed", true);
  const orderRows = assertNoError(ordersResult, "loading order reviews") as Row[];

  // Separate from the reviewed-order rating above: "Trusted" (see
  // computeVerificationLevel) needs a real completed-order count, and most
  // buyers never leave a review, so the rating-based orderCount would
  // massively undercount it.
  const escrowResult = await db.from("orders").select("seller, escrow_status").in("escrow_status", ["released", "disputed"]);
  const escrowRows = assertNoError(escrowResult, "loading order outcomes") as Row[];
  const completedBySeller = new Map<string, number>();
  const disputedBySeller = new Map<string, number>();
  for (const row of escrowRows) {
    const seller = row.seller as string;
    if (row.escrow_status === "released") completedBySeller.set(seller, (completedBySeller.get(seller) ?? 0) + 1);
    if (row.escrow_status === "disputed") disputedBySeller.set(seller, (disputedBySeller.get(seller) ?? 0) + 1);
  }

  const [baseMap, displayMap] = await Promise.all([
    Promise.resolve(
      computeSellerStatsMap(
        sellerRows.map((r) => ({ name: r.name as string, status: r.status as string })),
        orderRows.map((r) => ({ seller: r.seller as string, my_rating: r.my_rating as number | null }))
      )
    ),
    getStorePlanDisplayMap(),
  ]);

  const map = new Map<string, SellerStats>();
  for (const row of sellerRows) {
    const name = row.name as string;
    const base = baseMap.get(name) ?? { verified: false, rating: null, orderCount: 0 };
    const display = displayMap.get(row.id as string);
    const publicLocation = [row.public_area, row.public_city, row.public_state]
      .filter((v): v is string => Boolean(v && String(v).trim()))
      .join(", ") || null;
    map.set(name, {
      ...base,
      proBadge: display?.proBadge ?? false,
      featured: display?.featuredListingAccess ?? false,
      logoUrl: publicSellerPicture(row.logo_url as string | null, avatars.get(row.user_id as string)),
      bannerUrl: (row.banner_url as string | null) ?? null,
      verificationLevel: computeVerificationLevel({
        verificationStatus: row.verification_status as VerificationStatus,
        orderCount: completedBySeller.get(name) ?? 0,
        disputeCount: disputedBySeller.get(name) ?? 0,
        avgRating: base.rating,
      }),
      publicLocation,
      memberSince: (row.created_at as string | null) ?? null,
    });
  }
  // A name that shows up only via order rows (no matching sellers-table
  // row) — same "Ghost Seller" edge case computeSellerStatsMap already
  // handles — has no plan to speak of, so it gets the same falsy defaults
  // statsFor() would give it anyway.
  for (const [name, base] of baseMap) {
    if (!map.has(name)) {
      map.set(name, { ...base, ...DEFAULT_TIER_FIELDS });
    }
  }

  return map;
}

const DEFAULT_TIER_FIELDS = {
  proBadge: false,
  featured: false,
  logoUrl: null,
  bannerUrl: null,
  verificationLevel: "new" as VerificationLevel,
  publicLocation: null,
  memberSince: null,
};

const DEFAULT_SELLER_STATS: SellerStats = {
  verified: false,
  rating: null,
  orderCount: 0,
  ...DEFAULT_TIER_FIELDS,
};

function statsFor(map: Map<string, SellerStats>, seller: string): SellerStats {
  return map.get(seller) ?? DEFAULT_SELLER_STATS;
}

/* ------------------------------------------------------------------ */
/*  Products                                                            */
/* ------------------------------------------------------------------ */

function rowToProduct(row: Row, stats: SellerStats, images?: string[]): Product {
  const imageUrl = (row.image_url as string | null) ?? null;
  return {
    id: row.id as string,
    category: row.category as string,
    name: row.name as string,
    price: row.price as number,
    seller: row.seller as string,
    sellerId: (row.seller_id as string | null) ?? null,
    imageUrl,
    art: row.art as number,
    createdAt: row.created_at as string,
    lat: (row.lat as number | null) ?? null,
    lng: (row.lng as number | null) ?? null,
    verified: stats.verified,
    rating: stats.rating,
    active: row.active !== false,
    sellerProBadge: stats.proBadge,
    sellerFeatured: stats.featured,
    sellerLogoUrl: stats.logoUrl,
    sellerBannerUrl: stats.bannerUrl,
    sellerVerificationLevel: stats.verificationLevel,
    sellerLocation: stats.publicLocation,
    sellerMemberSince: stats.memberSince,
    boostedUntil: (row.boosted_until as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    condition: (row.condition as Product["condition"]) ?? null,
    qty: (row.qty as number | undefined) ?? 1,
    location: (row.location as string | null) ?? null,
    deliveryOption: (row.delivery_option as Product["deliveryOption"]) ?? null,
    deliveryFee: (row.delivery_fee as number | null | undefined) ?? 0,
    deliveryPricing: (row.delivery_pricing as DeliveryPricing | null | undefined) ?? null,
    deliveryRates: (row.delivery_rates as DeliveryRates | null | undefined) ?? null,
    weightG: (row.weight_g as number | null | undefined) ?? null,
    lengthCm: (row.length_cm as number | null | undefined) ?? null,
    widthCm: (row.width_cm as number | null | undefined) ?? null,
    heightCm: (row.height_cm as number | null | undefined) ?? null,
    shippingProfileId: (row.shipping_profile_id as string | null | undefined) ?? null,
    color: (row.color as string | null) ?? null,
    variation: (row.variation as string | null) ?? null,
    moderationStatus: (row.moderation_status as Product["moderationStatus"] | undefined) ?? "active",
    moderationReason: (row.moderation_reason as string | null) ?? null,
    // Falls back to just the cover when a caller didn't bulk-load the rest
    // (nothing today calls rowToProduct without images loaded, but this
    // keeps the field honest — never claiming zero photos when a cover
    // exists — if a future caller does).
    images: images ?? (imageUrl ? [imageUrl] : []),
  };
}

// One extra query for a whole page of products, not one per product — same
// shape as getSellerStatsMap/activeProductCountsBySeller. Every product's
// full, ordered photo list in a single Map, so listProducts() and
// listPublicProductsForSeller() can populate a real gallery without an N+1.
async function productImagesForIds(productIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (productIds.length === 0) return map;
  const db = getDb();
  const result = await db
    .from("product_images")
    .select("product_id, url, sort_order")
    .in("product_id", productIds)
    .order("sort_order", { ascending: true });
  const rows = assertNoError(result, "loading product images") as Row[];
  for (const row of rows) {
    const productId = row.product_id as string;
    const list = map.get(productId) ?? [];
    list.push(row.url as string);
    map.set(productId, list);
  }
  return map;
}

// Pure — is this listing's boost still in its paid-for window right now?
// Unit-testable without a database. No cron ever "expires" a boost: this is
// the one check standing between "still boosted" and quietly staying
// boosted forever, the same role isSubscriptionLapsed plays for a Store
// plan (lib/subscriptions.ts).
export function isBoostActive(boostedUntil: string | null, now: number = Date.now()): boolean {
  return Boolean(boostedUntil && new Date(boostedUntil).getTime() > now);
}

// Real placement for the Store subscription "featured listing" benefit
// (Business/Pro plans) — a stable sort keeps everything else in its
// existing recency order, it just pulls featured sellers' listings to the
// front as a group. Buyers with a real location still see the app's other
// core promise — "near you" — respected within each group, since Home/
// Browse layer their own distance sort on top of whatever order this
// returns; see the "featured" stable-sort note in those two components.
function sortFeaturedFirst(products: Product[]): Product[] {
  return [...products].sort((a, b) => Number(b.sellerFeatured) - Number(a.sellerFeatured));
}

// A boost outranks the Store-plan "featured" tier — a seller paid for this
// SPECIFIC listing, not an ambient plan benefit — but both are stable sorts
// layered the same way: pull the group to the front, leave everyone else's
// relative order untouched. Array.prototype.sort is stable in every engine
// this app runs on, so layering a second stable sort on top of the first
// never disturbs what sortFeaturedFirst already decided.
function sortForDisplay(products: Product[]): Product[] {
  const featuredFirst = sortFeaturedFirst(products);
  return [...featuredFirst].sort((a, b) => Number(isBoostActive(b.boostedUntil)) - Number(isBoostActive(a.boostedUntil)));
}

// Not real pagination — Browse/Home still expect one full array back, and
// building a server-side paged/filtered API is real future work (see
// PROJECT_STATUS.md's known issues), not something to retrofit here. This is
// only a safety ceiling: without it, an unauthenticated GET /api/products
// does a full, unbounded table scan that grows forever with the catalog.
// Comfortably above any realistic catalog size today — raise it (or replace
// this whole function) before it's ever actually reached.
const LIST_PRODUCTS_SAFETY_LIMIT = 2000;

export async function listProducts(): Promise<Product[]> {
  const db = getDb();
  const result = await db
    .from("products")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(LIST_PRODUCTS_SAFETY_LIMIT);
  const rows = assertNoError(result, "listing products") as Row[];
  const [stats, imagesById, summaries] = await Promise.all([
    getSellerStatsMap(),
    productImagesForIds(rows.map((row) => row.id as string)),
    shippingSummariesSafely(rows.map((row) => row.id as string)),
  ]);
  return sortForDisplay(
    rows.map((row) => ({
      ...rowToProduct(row, statsFor(stats, row.seller as string), imagesById.get(row.id as string)),
      ...(summaries.has(row.id as string) ? { shippingSummary: summaries.get(row.id as string) } : {}),
    }))
  );
}

// The listings shown on a seller's PUBLIC storefront. Two things make this
// different from filtering listProducts() on the client, which is what the
// seller profile screen used to do:
//
//   1. It matches on seller_id, so two accounts sharing a business name no
//      longer pool their listings into one storefront. The name fallback is
//      scoped to rows whose seller_id is still null (listings that predate
//      migration 009's backfill), exactly as listOrders does — a name
//      collision cannot misattribute those either, since a row with a
//      seller_id is never reached by the name query.
//   2. It returns only buyer-visible listings. A listing deactivated by a
//      Store plan downgrade still exists and still belongs to the seller,
//      but it is not for sale, so it has no place on a public storefront.
//      Same reasoning covers a listing an admin removed for a policy
//      violation (migration 027, moderationStatus) — 'under_review' still
//      shows (it's only a soft flag for a human, see lib/productReports.ts),
//      'removed' doesn't, same as the buyerVisibleProducts filter in
//      MainApp.jsx.
export async function listPublicProductsForSeller(seller: { id: string | null; name: string }): Promise<Product[]> {
  const db = getDb();

  const queries = seller.id
    ? [
        db.from("products").select("*").eq("seller_id", seller.id),
        db.from("products").select("*").eq("seller", seller.name).is("seller_id", null),
      ]
    : [db.from("products").select("*").eq("seller", seller.name)];

  const results = await Promise.all(queries);
  const rows = results.flatMap((r) => assertNoError(r, "listing seller products") as Row[]);
  const byId = new Map<string, Row>();
  for (const row of rows) byId.set(row.id as string, row);

  const [stats, imagesById] = await Promise.all([
    getSellerStatsMap(),
    productImagesForIds([...byId.keys()]),
  ]);
  return sortForDisplay(
    [...byId.values()]
      .map((row) => rowToProduct(row, statsFor(stats, row.seller as string), imagesById.get(row.id as string)))
      .filter((p) => p.active !== false && p.moderationStatus !== "removed")
  );
}

// Product-page delivery wording; never allowed to break the listing itself.
async function shippingSummariesSafely(ids: string[]): Promise<Map<string, string>> {
  try {
    return await shippingSummaries(ids);
  } catch (err) {
    console.error("[shipping] couldn't summarise delivery for listings", err);
    return new Map();
  }
}

export async function getProduct(id: string): Promise<Product | null> {
  const db = getDb();
  const result = await db.from("products").select("*").eq("id", id).maybeSingle();
  const row = assertNoError(result, "loading product") as Row | null;
  if (!row) return null;
  const [stats, imagesById] = await Promise.all([getSellerStatsMap(), productImagesForIds([id])]);
  return rowToProduct(row, statsFor(stats, row.seller as string), imagesById.get(id));
}

let productSeq = 0;

export const MAX_PRODUCT_IMAGES = 4;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_LOCATION_LENGTH = 120;
const MAX_COLOR_LENGTH = 60;
const MAX_VARIATION_LENGTH = 60;
const PRODUCT_CONDITIONS = ["New", "Used"] as const;
const DELIVERY_OPTIONS = ["Delivery", "Pickup", "Both"] as const;

// Pure — the actual listing-validity rules, unit-testable without a
// database. Every field is only checked when provided, so this also covers
// a partial update patch — createProduct separately requires condition and
// deliveryOption in its own input type, the same way it already requires
// name/price/category via TypeScript rather than a runtime check here.
// Category validity is NOT checked here — unlike everything else it
// depends on live DB state (an admin-editable table, see
// lib/categories.ts), so createProduct/updateProduct check it separately
// with an explicit await right where they already talk to the database.
export function validateProductInput(input: {
  category?: string;
  name?: string;
  price?: number;
  description?: string | null;
  condition?: string | null;
  qty?: number;
  location?: string | null;
  deliveryOption?: string | null;
  deliveryFee?: number | null;
  color?: string | null;
  variation?: string | null;
  images?: string[];
  weightG?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
}): void {
  if (input.name !== undefined && !input.name.trim()) {
    throw new ValidationError("Name is required.");
  }
  if (input.price !== undefined && (!Number.isFinite(input.price) || input.price <= 0)) {
    throw new ValidationError("Price must be a positive number.");
  }
  if (input.description != null && input.description.length > MAX_PRODUCT_DESCRIPTION_LENGTH) {
    throw new ValidationError(`Description can be at most ${MAX_PRODUCT_DESCRIPTION_LENGTH} characters (yours is ${input.description.length}).`);
  }
  if (input.condition != null && !(PRODUCT_CONDITIONS as readonly string[]).includes(input.condition)) {
    throw new ValidationError("Condition must be New or Used.");
  }
  if (input.qty !== undefined && (!Number.isInteger(input.qty) || input.qty < 0)) {
    throw new ValidationError("Quantity available must be a whole number, 0 or more.");
  }
  if (input.location != null && input.location.length > MAX_LOCATION_LENGTH) {
    throw new ValidationError(`Location must be under ${MAX_LOCATION_LENGTH} characters.`);
  }
  if (input.deliveryOption != null && !(DELIVERY_OPTIONS as readonly string[]).includes(input.deliveryOption)) {
    throw new ValidationError("Delivery option must be Delivery, Pickup, or Both.");
  }
  if (input.deliveryFee != null) parseDeliveryFee(input.deliveryFee);
  if (input.color != null && input.color.length > MAX_COLOR_LENGTH) {
    throw new ValidationError(`Color must be under ${MAX_COLOR_LENGTH} characters.`);
  }
  if (input.variation != null && input.variation.length > MAX_VARIATION_LENGTH) {
    throw new ValidationError(`Size/variation must be under ${MAX_VARIATION_LENGTH} characters.`);
  }
  if (input.weightG != null && (!Number.isInteger(input.weightG) || input.weightG < 1 || input.weightG > 1_000_000)) {
    throw new ValidationError("Weight must be between 1 g and 1,000 kg.");
  }
  for (const [label, v] of [["Length", input.lengthCm], ["Width", input.widthCm], ["Height", input.heightCm]] as const) {
    if (v != null && (!Number.isInteger(v) || v < 1 || v > 1000)) throw new ValidationError(`${label} must be a whole number of cm, 1–1000.`);
  }
  if (input.images !== undefined && input.images.length > MAX_PRODUCT_IMAGES) {
    throw new ValidationError(`You can add up to ${MAX_PRODUCT_IMAGES} photos.`);
  }
}

// Restricts a product's imageUrl to our own Supabase Storage bucket — a
// listing must not be able to point at an arbitrary external URL (used as a
// tracking pixel against every viewer, or content we don't control at all).
// Pure given the prefix, so it's unit-testable without env vars.
export function isValidProductImageUrl(url: string, storagePrefix: string): boolean {
  return url.startsWith(storagePrefix);
}

// Replaces a listing's ENTIRE photo set. Simplest correct option for at
// most MAX_PRODUCT_IMAGES rows on an infrequent action (a seller editing a
// listing, not a hot path) — no per-row diffing needed.
async function replaceProductImages(db: ReturnType<typeof getDb>, productId: string, images: string[]): Promise<void> {
  const deleteResult = await db.from("product_images").delete().eq("product_id", productId);
  assertNoError(deleteResult, "clearing product photos");
  if (images.length === 0) return;
  const insertResult = await db.from("product_images").insert(
    images.map((url, sortOrder) => ({ id: randomId("pimg_"), product_id: productId, url, sort_order: sortOrder }))
  );
  assertNoError(insertResult, "saving product photos");
}

export async function createProduct(input: {
  category: string;
  name: string;
  price: number;
  seller: string;
  // The caller's own seller account id, looked up via getSellerIdForUser —
  // dual-written alongside the text name so seller_id starts being trustworthy
  // for every NEW listing, without changing anything about how listings are
  // read or displayed today.
  sellerId?: string | null;
  // Ordered, cover photo first — image_url on the row is always images[0],
  // kept in sync here so every existing single-photo reader (ArtBlock and
  // everything built on it) needs no changes at all.
  images?: string[];
  lat?: number | null;
  lng?: number | null;
  description?: string | null;
  // Required, unlike every optional field below: a buyer deciding whether
  // to buy something deserves to know upfront whether it's new — FindIt
  // only accepts new-condition listings going forward (see the "New" check
  // just below), so this is narrowed to the one legal value at the type
  // level too. See migration 026 for why the column stays nullable at the
  // DB level regardless (an EXISTING pre-policy listing has no honest
  // answer until its seller edits it, and existing "Used" listings are
  // left as they are — this only blocks NEW ones).
  condition: "New";
  qty?: number;
  location?: string | null;
  deliveryOption: "Delivery" | "Pickup" | "Both";
  deliveryFee?: number | null;
  deliveryPricing?: DeliveryPricing | null;
  deliveryRates?: DeliveryRates | null;
  weightG?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  shippingProfileId?: string | null;
  color?: string | null;
  variation?: string | null;
}): Promise<Product> {
  validateProductInput(input);
  // Belt-and-braces beyond the type above: the API route already rejects
  // anything but "New" before this is ever called, but createProduct isn't
  // only reachable through that one route (tests, future callers) — the
  // actual policy boundary belongs here, not just at the HTTP edge.
  if (input.condition !== "New") {
    throw new ValidationError("New listings must be marked \"New\" — FindIt only accepts new-condition listings.");
  }
  if (!(await isValidCategoryKey(input.category))) {
    throw new ValidationError("Unknown category.");
  }
  if (input.shippingProfileId) await assertProfileBelongsTo(input.shippingProfileId, input.sellerId ?? null);

  // Backend-enforced, not a frontend nicety: a Free seller at their listing
  // cap can't bypass the "Add listing" button by hitting this API directly.
  // Only checked when the caller's seller_id is known — an account whose
  // seller_id hasn't been backfilled yet (pre-migration-009 data) can't have
  // its plan looked up reliably, so it falls back to today's behavior
  // (no limit) rather than blocking a real seller over a migration gap.
  if (input.sellerId) {
    await assertCanActivateProduct(input.sellerId);
  }

  // Admin-configurable prohibited-item check (migration 027) — a 'block'
  // rule refuses the listing outright, the same way an invalid category
  // does; a 'flag' rule lets it through but queues it for a human look
  // rather than showing it as an ordinary, fully-trusted listing.
  const matchedRule = findMatchingModerationRule(
    `${input.name} ${input.description ?? ""}`,
    await listActiveModerationRules()
  );
  if (matchedRule?.severity === "block") {
    throw new ValidationError(`This listing can't be posted: ${matchedRule.reason}`);
  }

  const db = getDb();
  const id = "p_" + Date.now().toString(36) + (productSeq++).toString(36);
  const images = input.images ?? [];
  const result = await db
    .from("products")
    .insert({
      id,
      category: input.category,
      name: input.name.trim(),
      price: Math.round(input.price),
      seller: input.seller,
      seller_id: input.sellerId ?? null,
      image_url: images[0] ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      art: Math.floor(Math.random() * 5),
      description: input.description?.trim() || null,
      condition: input.condition,
      qty: input.qty ?? 1,
      location: input.location?.trim() || null,
      delivery_option: input.deliveryOption,
      ...pricingColumns(input.deliveryOption, input.deliveryPricing, input.deliveryFee, input.deliveryRates),
      weight_g: input.weightG ?? null,
      length_cm: input.lengthCm ?? null,
      width_cm: input.widthCm ?? null,
      height_cm: input.heightCm ?? null,
      shipping_profile_id: input.deliveryOption === "Pickup" ? null : input.shippingProfileId ?? null,
      color: input.color?.trim() || null,
      variation: input.variation?.trim() || null,
      moderation_status: matchedRule ? "under_review" : "active",
      moderation_reason: matchedRule ? matchedRule.reason : null,
    })
    .select()
    .single();
  assertNoError(result, "creating product");
  await replaceProductImages(db, id, images);

  // The "first published product" qualifying action, if a referral is
  // waiting on it — fired on every new listing, not just a seller's
  // literal first (see qualifyReferral's own comment for why that's
  // equivalent and safe). Looked up from sellerId rather than threaded
  // through as a new parameter, since every existing caller already has
  // sellerId but not necessarily the owning user's id.
  if (input.sellerId) {
    const ownerResult = await db.from("sellers").select("user_id").eq("id", input.sellerId).maybeSingle();
    const owner = assertNoError(ownerResult, "loading seller for referral qualification") as Row | null;
    if (owner?.user_id) await qualifyReferral(owner.user_id as string, "first_product");
  }

  return getProduct(id) as Promise<Product>;
}

export async function updateProduct(
  id: string,
  patch: Partial<{
    name: string;
    category: string;
    price: number;
    images: string[];
    lat: number | null;
    lng: number | null;
    // Reactivating a listing a plan downgrade hid goes through the same
    // limit check createProduct does — a seller can't work around their
    // plan's cap by flipping an existing listing back on instead of making
    // a new one.
    active: boolean;
    description: string | null;
    condition: "New" | "Used" | null;
    qty: number;
    location: string | null;
    deliveryOption: "Delivery" | "Pickup" | "Both" | null;
    deliveryFee: number | null;
    deliveryPricing: DeliveryPricing | null;
    deliveryRates: DeliveryRates | null;
    weightG: number | null;
    lengthCm: number | null;
    widthCm: number | null;
    heightCm: number | null;
    shippingProfileId: string | null;
    color: string | null;
    variation: string | null;
  }>
): Promise<Product | null> {
  const existing = await getProduct(id);
  if (!existing) return null;

  validateProductInput(patch);
  if (patch.shippingProfileId) await assertProfileBelongsTo(patch.shippingProfileId, existing.sellerId);
  if (patch.category !== undefined && !(await isValidCategoryKey(patch.category))) {
    throw new ValidationError("Unknown category.");
  }

  // Same fallback-skip as createProduct: only enforced when this listing's
  // seller_id is known.
  if (patch.active === true && !existing.active && existing.sellerId) {
    await assertCanActivateProduct(existing.sellerId);
  }

  // Only re-run the prohibited-item check when the text that could contain
  // a match is actually changing — an unrelated edit (price, qty…) must
  // never silently clobber an admin's own 'removed' decision by re-deriving
  // moderationStatus from scratch every time. A 'block' match refuses the
  // edit; a 'flag' match only ever escalates a currently-clean listing,
  // never overwrites an existing flagged/removed state.
  let moderationEscalation: { status: "under_review"; reason: string } | null = null;
  if (patch.name !== undefined || patch.description !== undefined) {
    const name = patch.name ?? existing.name;
    const description = patch.description !== undefined ? patch.description : existing.description;
    const matchedRule = findMatchingModerationRule(`${name} ${description ?? ""}`, await listActiveModerationRules());
    if (matchedRule?.severity === "block") {
      throw new ValidationError(`This edit can't be saved: ${matchedRule.reason}`);
    }
    if (matchedRule && existing.moderationStatus === "active") {
      moderationEscalation = { status: "under_review", reason: matchedRule.reason };
    }
  }

  const db = getDb();
  const images = patch.images !== undefined ? patch.images : existing.images;
  const result = await db
    .from("products")
    .update({
      name: (patch.name ?? existing.name).trim(),
      category: patch.category ?? existing.category,
      price: Math.round(patch.price ?? existing.price),
      image_url: images[0] ?? null,
      lat: patch.lat !== undefined ? patch.lat : existing.lat,
      lng: patch.lng !== undefined ? patch.lng : existing.lng,
      active: patch.active !== undefined ? patch.active : existing.active,
      description: patch.description !== undefined ? (patch.description?.trim() || null) : existing.description,
      condition: patch.condition !== undefined ? patch.condition : existing.condition,
      qty: patch.qty !== undefined ? patch.qty : existing.qty,
      location: patch.location !== undefined ? (patch.location?.trim() || null) : existing.location,
      delivery_option: patch.deliveryOption !== undefined ? patch.deliveryOption : existing.deliveryOption,
      // Delivery pricing is re-checked only when the seller changes it, so an
      // unrelated edit (price, photos) never forces a choice on an older listing.
      ...(patch.deliveryOption !== undefined ||
      patch.deliveryPricing !== undefined ||
      patch.deliveryFee !== undefined ||
      patch.deliveryRates !== undefined
        ? pricingColumns(
            patch.deliveryOption !== undefined ? patch.deliveryOption : existing.deliveryOption,
            patch.deliveryPricing !== undefined ? patch.deliveryPricing : existing.deliveryPricing,
            patch.deliveryFee !== undefined ? patch.deliveryFee : existing.deliveryFee,
            patch.deliveryRates !== undefined ? patch.deliveryRates : existing.deliveryRates
          )
        : {}),
      weight_g: patch.weightG !== undefined ? patch.weightG : existing.weightG,
      length_cm: patch.lengthCm !== undefined ? patch.lengthCm : existing.lengthCm,
      width_cm: patch.widthCm !== undefined ? patch.widthCm : existing.widthCm,
      height_cm: patch.heightCm !== undefined ? patch.heightCm : existing.heightCm,
      shipping_profile_id:
        (patch.deliveryOption !== undefined ? patch.deliveryOption : existing.deliveryOption) === "Pickup"
          ? null
          : patch.shippingProfileId !== undefined
            ? patch.shippingProfileId
            : existing.shippingProfileId,
      color: patch.color !== undefined ? (patch.color?.trim() || null) : existing.color,
      variation: patch.variation !== undefined ? (patch.variation?.trim() || null) : existing.variation,
      ...(moderationEscalation
        ? { moderation_status: moderationEscalation.status, moderation_reason: moderationEscalation.reason }
        : {}),
    })
    .eq("id", id);
  assertNoError(result, "updating product");
  if (patch.images !== undefined) {
    await replaceProductImages(db, id, images);
  }

  // Saving a listing (the heart icon) used to be a dead end — nothing ever
  // watched it afterward, so a price drop or restock was invisible to
  // everyone who'd saved it unless they stumbled back onto the listing
  // themselves. Only these two edits are worth interrupting a saver for;
  // anything else (photos, description, color) stays silent. Skipped
  // entirely when the listing ends up inactive from this same edit — no
  // point telling someone about a deal on a listing they can't see.
  const nowActive = patch.active !== undefined ? patch.active : existing.active;
  const nowPrice = Math.round(patch.price ?? existing.price);
  const priceDropped = nowActive && patch.price !== undefined && nowPrice < existing.price;
  const restocked = nowActive && patch.qty !== undefined && existing.qty === 0 && patch.qty > 0;
  if (priceDropped || restocked) {
    const saversResult = await db.from("saved_items").select("user_id").eq("product_id", id);
    const savers = assertNoError(saversResult, "listing savers of product") as Row[];
    const title = priceDropped ? "Price drop on a saved item" : "Back in stock";
    const body = priceDropped
      ? `"${existing.name}" dropped to ₦${nowPrice.toLocaleString("en-NG")}.`
      : `"${existing.name}" is back in stock.`;
    await Promise.all(savers.map((s) => notifyBestEffort({ userId: s.user_id as string, type: "saved_item", title, body })));
  }

  return getProduct(id);
}

// A hard delete, unlike moderateProduct's soft "removed" status — and
// product_reports has `on delete cascade` on this row (migration 027), so
// deleting a listing permanently erases every report ever filed against it.
// A seller under active review could otherwise destroy that evidence
// unilaterally, the moment they realize they've been reported, before an
// admin ever gets to look at it — the same kind of moderation bypass
// already closed once this session for shared links to a removed listing.
// Only a seller is blocked here; an admin who has already reviewed a
// listing and decided it should go still can, same as they already can via
// moderateProduct's own removal path.
export async function deleteProduct(id: string, actingAdminId: string | null = null): Promise<boolean> {
  if (!actingAdminId) {
    const statusResult = await getDb().from("products").select("moderation_status").eq("id", id).maybeSingle();
    const statusRow = assertNoError(statusResult, "checking listing before deleting") as Row | null;
    if (statusRow?.moderation_status === "under_review") {
      throw new ValidationError(
        "This listing is under review and can't be deleted right now — an admin needs to resolve the report first."
      );
    }
  }
  const db = getDb();
  const result = await db.from("products").delete().eq("id", id).select();
  const rows = assertNoError(result, "deleting product") as Row[];
  return rows.length > 0;
}

/* ------------------------------------------------------------------ */
/*  Orders                                                              */
/* ------------------------------------------------------------------ */

function rowToOrder(row: Row): Order {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    item: row.item as string,
    seller: row.seller as string,
    sellerId: (row.seller_id as string | null) ?? null,
    price: row.price as number,
    status: row.status as string,
    canReview: Boolean(row.can_review),
    reviewed: Boolean(row.reviewed),
    myRating: (row.my_rating as number | null) ?? null,
    reviewComment: (row.review_comment as string | null) ?? null,
    requestId: (row.request_id as string | null) ?? null,
    createdAt: row.created_at as string,
    buyerConfirmedAt: (row.buyer_confirmed_at as string | null) ?? null,
    dispatchedAt: (row.dispatched_at as string | null) ?? null,
    escrowStatus: ((row.escrow_status as EscrowStatus | null) ?? "unpaid"),
    issueReportedAt: (row.issue_reported_at as string | null) ?? null,
    issueNote: (row.issue_note as string | null) ?? null,
    paymentStatus: ((row.payment_status as PaymentStatus | null) ?? "pending"),
    paidAt: (row.paid_at as string | null) ?? null,
    platformFeeBps: (row.platform_fee_bps as number | null) ?? null,
    platformFeeAmount: (row.platform_fee_amount as number | null) ?? null,
    sellerPayoutAmount: (row.seller_payout_amount as number | null) ?? null,
    creditApplied: (row.credit_applied as number | null) ?? 0,
    itemPrice: (row.item_price as number | null | undefined) ?? (row.price as number) - ((row.delivery_fee as number | null | undefined) ?? 0),
    deliveryOptions: (row.delivery_options as DeliveryOptions | null | undefined) ?? null,
    deliveryFeeQuote: (row.delivery_fee_quote as number | null | undefined) ?? 0,
    deliveryMethod: (row.delivery_method as DeliveryMethod | null | undefined) ?? null,
    deliveryFee: (row.delivery_fee as number | null | undefined) ?? 0,
    deliveryAddress: (row.delivery_address as DeliveryAddress | null | undefined) ?? null,
    deliveryLocked: Boolean(row.delivery_locked),
    deliveryRates: (row.delivery_rates as DeliveryRates | null | undefined) ?? null,
    deliveryFeeUnset: Boolean(row.delivery_fee_unset),
    shippingOption: (row.shipping_option as Order["shippingOption"] | undefined) ?? null,
    pickupLocation: (row.pickup_location as PickupSnapshot | null | undefined) ?? null,
    pickupStatus: (row.pickup_status as Order["pickupStatus"] | undefined) ?? null,
    packageWeightG: (row.package_weight_g as number | null | undefined) ?? null,
    buyerName: null,
    lines: Array.isArray(row.lines) ? (row.lines as OrderLine[]) : [],
    cancelledAt: (row.cancelled_at as string | null | undefined) ?? null,
    cancelReason: (row.cancel_reason as Order["cancelReason"] | undefined) ?? null,
  };
}

// A buyer's address is theirs until they've actually paid: a seller sees
// where to deliver only on a paid order, never on a checkout someone started
// and abandoned.
function withAddressPrivacy(order: Order, viewerId: string): Order {
  if (order.userId === viewerId || order.paymentStatus === "paid") return order;
  return { ...order, deliveryAddress: null };
}

export const ORDER_STATUSES = [
  "Awaiting payment",
  "Seller preparing",
  "Dispatched",
  "Out for delivery",
  "Delivered",
] as const;

// A buyer's own orders, plus (when a seller is given) orders placed
// against that seller's account so they have something to fulfill. There
// is no more "shared guest content" — every order belongs to a real
// logged-in buyer (see the "guest checkout" note in app/api/orders/route.ts).
export async function listOrders(
  userId: string,
  seller?: { name: string; id: string | null } | null
): Promise<Order[]> {
  const db = getDb();
  if (!seller) {
    const result = await db.from("orders").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    const rows = assertNoError(result, "listing orders") as Row[];
    const mine = rows.map(rowToOrder);
    await attachShipments(mine);
    return mine;
  }

  // business_name has no uniqueness constraint (see the seller_id migration
  // rationale), so a plain name match alone would return a DIFFERENT
  // seller's entire order history to anyone who signs up with the same
  // name. When this seller has a real seller_id, match orders by that
  // instead — safe even under a name collision — and only fall back to a
  // name match for orders that predate the seller_id backfill (seller_id
  // still null on the row itself, so a name collision can't misattribute
  // them to the wrong account). Only a seller with no seller_id resolvable
  // at all (shouldn't normally happen for an existing account) falls back
  // to the legacy name-only match.
  const queries = [db.from("orders").select("*").eq("user_id", userId)];
  if (seller.id) {
    queries.push(db.from("orders").select("*").eq("seller_id", seller.id));
    queries.push(db.from("orders").select("*").eq("seller", seller.name).is("seller_id", null));
  } else {
    queries.push(db.from("orders").select("*").eq("seller", seller.name));
  }

  const results = await Promise.all(queries);
  const rowSets = results.map((r, i) => assertNoError(r, i === 0 ? "listing orders" : "listing seller orders") as Row[]);
  const byId = new Map<string, Row>();
  for (const row of rowSets.flat()) byId.set(row.id as string, row);
  const sellerOrders = [...byId.values()].map((row) => withAddressPrivacy(rowToOrder(row), userId));
  // The buyer's name on PAID orders the seller is looking at: who to deliver
  // to or expect for pickup, and who their customers are.
  const paidBuyerIds = [...new Set(sellerOrders.filter((o) => o.userId !== userId && o.paymentStatus === "paid").map((o) => o.userId))];
  if (paidBuyerIds.length > 0) {
    const namesResult = await db.from("users").select("id, name").in("id", paidBuyerIds);
    const names = new Map((assertNoError(namesResult, "loading buyer names") as Row[]).map((r) => [r.id as string, r.name as string]));
    for (const o of sellerOrders) {
      if (o.userId !== userId && o.paymentStatus === "paid") o.buyerName = names.get(o.userId) ?? null;
    }
  }
  await attachShipments(sellerOrders);
  return sellerOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// Tracking for each order that has been sent out; never breaks the list.
async function attachShipments(orders: Order[]): Promise<void> {
  const sent = orders.filter((o) => o.dispatchedAt).map((o) => o.id);
  if (sent.length === 0) return;
  try {
    const byOrder = await shipmentsForOrders(sent);
    for (const o of orders) o.shipment = byOrder.get(o.id) ?? null;
  } catch (err) {
    console.error("[shipping] couldn't load tracking", err);
  }
}

// Internal — every field here must already be trusted (derived from a real
// product/offer row on the server), never taken directly from client input.
// createOrderFromProduct and acceptOffer are the only two ways an order gets
// created; both compute item/seller/price themselves before calling this.
async function insertOrder(input: {
  item: string;
  seller: string;
  // See sellerId on createProduct — same dual-write, carried through from
  // whichever product/offer this order was created from (both already carry
  // their own seller_id by the time this runs).
  sellerId?: string | null;
  price: number;
  status: string;
  requestId?: string | null;
  userId: string;
  // The delivery choices the buyer will have at checkout, and what delivery
  // costs if chosen. price above is the item alone until they choose.
  deliveryOptions?: DeliveryOptions | null;
  deliveryFeeQuote?: number;
  deliveryRates?: DeliveryRates | null;
  deliveryFeeUnset?: boolean;
  lines?: OrderLine[];
}): Promise<Order> {
  const db = getDb();
  const id = randomId("ORD-");
  const result = await db
    .from("orders")
    .insert({
      id,
      user_id: input.userId,
      item: input.item,
      seller: input.seller,
      seller_id: input.sellerId ?? null,
      price: input.price,
      item_price: input.price,
      delivery_options: input.deliveryOptions ?? null,
      delivery_fee_quote: input.deliveryOptions === "Pickup" ? 0 : Math.max(0, Math.round(input.deliveryFeeQuote ?? 0)),
      delivery_fee: 0,
      delivery_locked: false,
      delivery_rates: input.deliveryOptions === "Pickup" ? null : input.deliveryRates ?? null,
      delivery_fee_unset: input.deliveryOptions !== "Pickup" && Boolean(input.deliveryFeeUnset),
      lines: input.lines ?? [],
      status: input.status,
      request_id: input.requestId ?? null,
    })
    .select()
    .single();
  const row = assertNoError(result, "creating order") as Row;
  return rowToOrder(row);
}

// A listing's delivery pricing columns, checked (lib/delivery.ts#normalizeDeliveryPricing).
function pricingColumns(option: string | null | undefined, pricing: unknown, fee: unknown, rates: unknown) {
  const p = normalizeDeliveryPricing({ deliveryOption: option, deliveryPricing: pricing, deliveryFee: fee, deliveryRates: rates });
  return { delivery_pricing: p.deliveryPricing, delivery_fee: p.deliveryFee, delivery_rates: p.deliveryRates };
}

// What delivering one listing costs to a state (0 for free shipping).
function listingFeeFor(p: Product, state: string | null): number {
  if (p.deliveryOption === "Pickup" || p.deliveryPricing === "free") return 0;
  if (p.deliveryPricing === "location" && state && p.deliveryRates && state in p.deliveryRates) return p.deliveryRates[state];
  return p.deliveryFee;
}

const MAX_ORDER_QTY = 999;
const MAX_CART_LINES = 50;

// The words a buyer sees when they ask for more than there is.
function stockMessage(product: Product, qty: number): string | null {
  if (product.qty === 0) return product.name + " is sold out.";
  if (qty > product.qty) return `Only ${product.qty} of ${product.name} left.`;
  return null;
}

// Checks one cart line against the real listing. price/seller/name are NEVER
// taken from the client — only which product and how many.
async function orderableProduct(productId: string, qty: number): Promise<Product> {
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_ORDER_QTY) {
    throw new ValidationError(`Quantity must be between 1 and ${MAX_ORDER_QTY}.`);
  }
  const product = await getProduct(productId);
  if (!product || product.active === false || product.moderationStatus === "removed") {
    throw new ValidationError("That product is no longer available.");
  }
  // qty is real stock now: confirming a payment takes the order's quantity
  // off it (decrementStockForOrder). Checked again when payment starts.
  if (product.qty === 0) throw new ValidationError("This item is out of stock.");
  const short = stockMessage(product, qty);
  if (short) throw new ValidationError(short);
  return product;
}

// One order from several of ONE seller's products (or one product): one
// checkout, one delivery fee. The buyer can choose only what every item
// allows; delivery costs the highest of the items' delivery fees (one parcel,
// one trip), never the sum.
async function insertOrderForProducts(items: { product: Product; qty: number }[], userId: string): Promise<Order> {
  const first = items[0].product;
  const lines: OrderLine[] = items.map(({ product, qty }) => ({
    productId: product.id,
    name: product.name,
    qty,
    unitPrice: product.price,
  }));
  const delivery = items.every(({ product }) => deliveryChoices(product.deliveryOption).delivery);
  const pickup = items.every(({ product }) => deliveryChoices(product.deliveryOption).pickup);
  const deliveryOptions: DeliveryOptions | null =
    items.length === 1 ? first.deliveryOption : delivery && pickup ? "Both" : delivery ? "Delivery" : "Pickup";
  // One parcel, one trip: for each state, the highest of the items' fees to
  // that state; deliveryFeeQuote for any state no item prices separately.
  const deliverable = items.filter(({ product }) => product.deliveryOption !== "Pickup").map(({ product }) => product);
  const feeQuote = delivery ? Math.max(0, ...deliverable.map((p) => listingFeeFor(p, null))) : 0;
  const rateStates = new Set(deliverable.flatMap((p) => (p.deliveryPricing === "location" ? Object.keys(p.deliveryRates ?? {}) : [])));
  const rates: DeliveryRates = {};
  for (const state of rateStates) {
    const fee = Math.max(0, ...deliverable.map((p) => listingFeeFor(p, state)));
    if (fee !== feeQuote) rates[state] = fee;
  }
  const deliveryRates = delivery && Object.keys(rates).length > 0 ? rates : null;

  return insertOrder({
    item: lines.map((l) => (l.qty > 1 ? `${l.name} ×${l.qty}` : l.name)).join(", "),
    seller: first.seller,
    sellerId: first.sellerId,
    price: lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0),
    status: "Awaiting payment",
    userId,
    deliveryOptions,
    deliveryFeeQuote: feeQuote,
    deliveryRates,
    deliveryFeeUnset: delivery && deliverable.some((p) => p.deliveryPricing == null && p.deliveryFee === 0),
    lines,
  });
}

// The "Buy now" path.
export async function createOrderFromProduct(
  productId: string,
  qty: number,
  userId: string
): Promise<Order> {
  const product = await orderableProduct(productId, qty);
  // No seller notification here — the seller learns about this order once
  // it's actually paid for (see lib/payments.ts#confirmOrderPayment), not
  // the moment a buyer starts checkout on something they might never pay.
  return insertOrderForProducts([{ product, qty }], userId);
}

// Checking out a cart: ONE order per seller, so the buyer pays each seller's
// delivery fee once and checks out once per seller, not once per item. Every
// line is checked before any order is created, so a problem with one item
// never leaves half a cart ordered. The rare seller whose items can't share
// a delivery choice (one is delivery-only, another pickup-only) gets one
// order per item instead.
export async function createOrdersFromCart(
  items: { productId: string; qty: number }[],
  userId: string
): Promise<Order[]> {
  if (!Array.isArray(items) || items.length === 0) throw new ValidationError("Your cart is empty.");
  if (items.length > MAX_CART_LINES) throw new ValidationError(`A cart can hold up to ${MAX_CART_LINES} different items.`);

  const qtyById = new Map<string, number>();
  for (const it of items) {
    if (!it || typeof it.productId !== "string") throw new ValidationError("Something in your cart isn't a product.");
    qtyById.set(it.productId, (qtyById.get(it.productId) ?? 0) + Number(it.qty));
  }
  const checked: { product: Product; qty: number }[] = [];
  for (const [productId, qty] of qtyById) checked.push({ product: await orderableProduct(productId, qty), qty });

  const bySeller = new Map<string, { product: Product; qty: number }[]>();
  for (const it of checked) {
    const key = it.product.sellerId ?? "name:" + it.product.seller;
    bySeller.set(key, [...(bySeller.get(key) ?? []), it]);
  }

  const orders: Order[] = [];
  for (const group of bySeller.values()) {
    const canShare =
      group.every(({ product }) => deliveryChoices(product.deliveryOption).delivery) ||
      group.every(({ product }) => deliveryChoices(product.deliveryOption).pickup);
    if (canShare) orders.push(await insertOrderForProducts(group, userId));
    else for (const it of group) orders.push(await insertOrderForProducts([it], userId));
  }
  return orders;
}

// Before payment starts: is there still enough of everything in this order?
// Throws ValidationError with what's short.
export async function assertOrderInStock(order: Order): Promise<void> {
  for (const line of order.lines) {
    const product = await getProduct(line.productId);
    if (!product || product.active === false || product.moderationStatus === "removed") {
      throw new ValidationError(`${line.name} is no longer available. Cancel this order and order again.`);
    }
    const short = stockMessage(product, line.qty);
    if (short) throw new ValidationError(`${short} Cancel this order and order again.`);
  }
}

// Called once, when an order's payment is confirmed: takes each line's
// quantity off the product's stock. Never below 0 (two buyers paying for
// the last one at the same moment both keep their order; the seller sees 0
// left and sorts it out, the same as a shop that oversold). A conditional
// write on the qty just read, retried, so two payments can't lose an update.
export async function decrementStockForOrder(order: Order): Promise<void> {
  return adjustStockForOrder(order, -1);
}

// The other way: an order that's refunded before it ever left the seller
// puts its items back on sale.
export async function restockOrder(order: Order): Promise<void> {
  return adjustStockForOrder(order, 1);
}

async function adjustStockForOrder(order: Order, direction: 1 | -1): Promise<void> {
  const db = getDb();
  for (const line of order.lines) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const read = await db.from("products").select("qty, name, seller, seller_id").eq("id", line.productId).maybeSingle();
      const row = assertNoError(read, "reading stock") as Row | null;
      if (!row) break; // listing deleted since: nothing to update
      const current = (row.qty as number | null) ?? 0;
      const next = Math.max(0, current + direction * line.qty);
      if (next === current) break;
      const write = await db.from("products").update({ qty: next }).eq("id", line.productId).eq("qty", current).select("id").maybeSingle();
      if (assertNoError(write, "updating stock")) {
        // Most listings start at quantity 1, so the seller needs to know the
        // moment one sells out, or it silently stops being buyable.
        if (next === 0 && direction === -1) {
          try {
          const seller = row.seller_id
            ? await findUserForSellerId(row.seller_id as string)
            : await findUserByBusinessName(row.seller as string);
          if (seller) {
            await notifyBestEffort({
              userId: seller.id,
              type: "payment",
              title: "Sold out",
              body: `"${row.name}" is now sold out. Edit the listing to add more stock.`,
            });
          }
          } catch (err) {
            console.error("[stock] couldn't tell the seller a listing sold out", err);
          }
        }
        break;
      }
    }
  }
}

async function restockSafely(order: Order): Promise<void> {
  try {
    await restockOrder(order);
  } catch (err) {
    console.error("[stock] couldn't put stock back for", order.id, err);
  }
}

// Tells every FindIt admin about something that needs a person, e.g. a
// refund Paystack wouldn't take. Best-effort.
export async function notifyAdminsBestEffort(title: string, body: string): Promise<void> {
  try {
    const db = getDb();
    const admins = assertNoError(await db.from("users").select("id").eq("role", "admin"), "listing admins") as Row[];
    for (const a of admins) await notifyBestEffort({ userId: a.id as string, type: "payment", title, body });
  } catch (err) {
    console.error("[admin] couldn't notify admins", err);
  }
}

export const SELLER_CANCEL_REASONS = {
  out_of_stock: "it's out of stock",
  cant_deliver: "they can't deliver it",
  price_error: "the price was listed wrongly",
  other: "they can't fulfil it",
} as const;
export type SellerCancelReason = keyof typeof SELLER_CANCEL_REASONS;

// "Can't fulfil this order": the seller cancels a PAID order they haven't
// dispatched (sold out, can't deliver, wrong price). Only the seller whose
// order it is; only before dispatch and with no problem reported, so a
// seller can never take back an order that's on its way. Marks it cancelled
// with the money refunded (escrow 'refunded'), puts the stock back and tells
// the buyer why. The actual Paystack refund is the caller's next step
// (lib/payments.ts#refundOrderPayment; see app/api/orders/[id]/seller-cancel).
// Returns null if the order isn't this seller's, or can't be cancelled now.
export async function sellerCancelPaidOrder(
  orderId: string,
  seller: { id: string | null; name: string },
  reason: SellerCancelReason
): Promise<Order | null> {
  if (!(reason in SELLER_CANCEL_REASONS)) throw new ValidationError("Choose why you can't fulfil this order.");
  const existing = await getOrder(orderId);
  if (!existing) return null;
  const mine =
    (seller.id && existing.sellerId === seller.id) || (existing.sellerId == null && existing.seller === seller.name);
  if (!mine) return null;
  if (existing.paymentStatus !== "paid") {
    throw new ValidationError("This order hasn't been paid, so there's nothing to cancel. It closes by itself if the buyer doesn't pay.");
  }
  if (existing.dispatchedAt || !["Awaiting payment", "Seller preparing"].includes(existing.status)) {
    throw new ValidationError("This order is already on its way, so it can't be cancelled here. Message the buyer, or contact FindIt support.");
  }
  if (existing.escrowStatus !== "held") {
    throw new ValidationError("This order can't be cancelled now. Contact FindIt support.");
  }

  const db = getDb();
  const result = await db
    .from("orders")
    .update({ status: "Cancelled", escrow_status: "refunded", cancelled_at: new Date().toISOString(), can_review: false })
    .eq("id", orderId)
    .eq("payment_status", "paid")
    .eq("escrow_status", "held")
    .is("dispatched_at", null)
    .is("issue_reported_at", null)
    .select()
    .maybeSingle();
  const row = assertNoError(result, "cancelling a paid order") as Row | null;
  if (!row) throw new ValidationError("This order just changed. Refresh and try again.");
  const order = rowToOrder(row);

  await restockSafely(order);
  await notifyBestEffort({
    userId: order.userId,
    type: "payment",
    title: "Order cancelled and refunded",
    body: `${order.seller} cancelled your order for "${order.item}" because ${SELLER_CANCEL_REASONS[reason]}. FindIt is refunding your ₦${order.price.toLocaleString("en-NG")}.`,
    sms: `FindIt: ${order.seller} couldn't fulfil "${shortItem(order.item)}", so it was cancelled. Your ₦${order.price.toLocaleString("en-NG")} is being refunded.`,
  });
  return order;
}

// Item names in text messages: short enough to keep a text to one or two SMS pages.
function shortItem(item: string): string {
  return item.length > 40 ? item.slice(0, 37) + "..." : item;
}

export const UNPAID_ORDER_DAYS = 7;

// Cancels an order that hasn't been paid: status 'Cancelled'. Conditional on
// it still being unpaid and awaiting payment, so it can't race a payment
// that is confirming at the same moment (and a payment that completes later
// anyway reopens it, see lib/payments.ts#confirmOrderPayment). An order from
// an accepted request offer puts the request back up, so the buyer can pick
// another offer, and tells the seller whose offer it was.
// Returns null if the order wasn't in a state that could be cancelled.
export async function cancelUnpaidOrder(orderId: string, reason: "buyer" | "expired"): Promise<Order | null> {
  const db = getDb();
  const result = await db
    .from("orders")
    .update({ status: "Cancelled", cancelled_at: new Date().toISOString(), cancel_reason: reason })
    .eq("id", orderId)
    .eq("status", "Awaiting payment")
    .neq("payment_status", "paid")
    .select()
    .maybeSingle();
  const row = assertNoError(result, "cancelling order") as Row | null;
  if (!row) return null;
  const order = rowToOrder(row);

  if (order.requestId) {
    try {
      await assertNoError(
        await db.from("requests").update({ status: "open" }).eq("id", order.requestId).eq("status", "matched"),
        "reopening request"
      );
      await assertNoError(
        await db.from("offers").update({ accepted: false }).eq("request_id", order.requestId).eq("accepted", true),
        "un-accepting offer"
      );
      const seller = order.sellerId ? await findUserForSellerId(order.sellerId) : await findUserByBusinessName(order.seller);
      if (seller) {
        await notifyBestEffort({
          userId: seller.id,
          type: "offer",
          title: "Order cancelled",
          body: `The buyer's order for "${order.item}" was cancelled before payment. The request is open again.`,
        });
      }
    } catch (err) {
      // The order itself is cancelled either way; this is housekeeping.
      console.error("[cancel] couldn't reopen the request for", orderId, err);
    }
  }
  return order;
}

// Daily (app/api/cron/expirations): closes orders left unpaid for
// UNPAID_ORDER_DAYS, so My orders doesn't fill up with checkouts nobody
// finished. Skips any order with a payment started in the last day, in case
// the buyer is paying right now. Returns how many were closed.
export async function expireUnpaidOrders(): Promise<number> {
  const db = getDb();
  const cutoff = new Date(Date.now() - UNPAID_ORDER_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const recent = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const staleResult = await db
    .from("orders")
    .select("id, user_id, item")
    .eq("status", "Awaiting payment")
    .neq("payment_status", "paid")
    .lte("created_at", cutoff)
    .limit(200);
  const stale = assertNoError(staleResult, "listing unpaid orders") as Row[];

  let closed = 0;
  for (const row of stale) {
    const pendingResult = await db
      .from("payments")
      .select("id")
      .eq("order_id", row.id as string)
      .eq("status", "pending")
      .gte("created_at", recent)
      .limit(1)
      .maybeSingle();
    if (assertNoError(pendingResult, "checking for a payment in progress")) continue;
    const order = await cancelUnpaidOrder(row.id as string, "expired");
    if (!order) continue;
    closed++;
    await notifyBestEffort({
      userId: order.userId,
      type: "payment",
      title: "Unpaid order closed",
      body: `Your order for "${order.item}" was closed because it wasn't paid within ${UNPAID_ORDER_DAYS} days. You can order it again any time.`,
    });
  }
  return closed;
}

// Shared by both ways an order gets created (direct purchase and accepting
// a request offer) — looks the seller's account up so the notification
// lands on the right user, not just a string on the order row. Called only
// once a payment is actually confirmed (lib/payments.ts), never at order
// creation.
//
// Prefers order.sellerId (unambiguous) over the business-name lookup —
// business_name has no uniqueness constraint, so findUserByBusinessName's
// .maybeSingle() throws when two sellers share a name. Left unguarded, that
// throw would propagate out of confirmOrderPayment AFTER the order's
// payment_status write already committed: the Paystack webhook handler
// would then retry forever on a payment that was, in fact, already applied,
// and the real seller would never actually get notified. Name lookup stays
// only as the fallback for orders with no seller_id (pre-backfill data).
export async function notifySellerOfNewOrder(sellerBusinessName: string, order: Order): Promise<void> {
  const seller = order.sellerId
    ? await findUserForSellerId(order.sellerId)
    : await findUserByBusinessName(sellerBusinessName);
  if (!seller) return; // seller hasn't joined FindIt as an account directly — nothing to notify
  await notifyBestEffort({
    userId: seller.id,
    type: "payment",
    title: "New order",
    body: `"${order.item}" was just ordered — ₦${order.price.toLocaleString("en-NG")} is held by FindIt until delivery is confirmed.`,
    sms: `FindIt: New paid order! "${shortItem(order.item)}" (₦${order.price.toLocaleString("en-NG")}). ${
      order.deliveryMethod === "pickup"
        ? "The buyer will pick it up."
        : order.deliveryAddress
          ? `Deliver to ${order.deliveryAddress.area}, ${order.deliveryAddress.state}.`
          : ""
    } Open FindIt to prepare it.`,
  });
}

const MAX_REVIEW_COMMENT_LENGTH = 1000;

export async function submitOrderReview(
  id: string,
  userId: string,
  review: { rating: number; comment: string | null }
): Promise<Order | null> {
  if (review.comment != null && review.comment.length > MAX_REVIEW_COMMENT_LENGTH) {
    throw new ValidationError(`Review must be under ${MAX_REVIEW_COMMENT_LENGTH} characters.`);
  }

  const existing = await getOrder(id);
  if (!existing || existing.userId !== userId) return null;
  if (!existing.canReview) {
    throw new ValidationError("You can review this order once you confirm it arrived.");
  }
  if (existing.reviewed) {
    throw new ValidationError("You've already reviewed this order.");
  }

  const db = getDb();
  const result = await db
    .from("orders")
    .update({ reviewed: true, my_rating: review.rating, review_comment: review.comment })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("reviewed", false)
    .select()
    .maybeSingle();
  const row = assertNoError(result, "submitting review") as Row | null;
  if (!row) throw new ValidationError("You've already reviewed this order.");
  const order = rowToOrder(row);

  // Same purely-additive, best-effort contract as recordCompletedTransaction
  // (lib/transactionRecord.ts): the order above is the review as far as the
  // buyer is concerned, already saved and already the source every rating
  // computation reads — this just makes its text findable and answerable
  // afterward, and never undoes what just succeeded if it fails.
  await recordReview(order, userId, review);

  // order.sellerId when available (unambiguous) — see notifySellerOfNewOrder's
  // comment above for why a bare business-name lookup here is a real bug,
  // not just a style preference: it throws on a name collision, which would
  // propagate out of whichever order-lifecycle step this is and fail an
  // action that had already succeeded (the review/confirmation/report/
  // resolution itself is saved before this notification runs).
  const seller = order.sellerId
    ? await findUserForSellerId(order.sellerId)
    : await findUserByBusinessName(order.seller);
  if (seller) {
    await notifyBestEffort({
      userId: seller.id,
      type: "review",
      title: "New review",
      body: `You got a ${review.rating}-star review for "${order.item}".`,
    });
  }

  return order;
}

export async function getOrder(id: string): Promise<Order | null> {
  const db = getDb();
  const result = await db.from("orders").select("*").eq("id", id).maybeSingle();
  const row = assertNoError(result, "loading order") as Row | null;
  return row ? rowToOrder(row) : null;
}

// The buyer's delivery choice at checkout: delivered to an address (adding
// the seller's delivery fee to the price) or picked up from the seller.
// Only the buyer, and only while the order is unpaid. Once they've started
// paying (deliveryLocked) the method and price are fixed and only the
// address can still be corrected. The address is also saved to the buyer's
// account so their next checkout is already filled in.
export async function setOrderDelivery(
  orderId: string,
  userId: string,
  input: { method?: unknown; address?: unknown; optionId?: unknown; pickupLocationId?: unknown }
): Promise<Order | null> {
  const order = await getOrder(orderId);
  if (!order || order.userId !== userId) return null;
  if (order.paymentStatus === "paid") {
    throw new ValidationError("This order is already paid. Message the seller if the delivery details need to change.");
  }

  const method = input.method;
  if (method !== "delivery" && method !== "pickup") {
    throw new ValidationError("Choose delivery or pickup.");
  }
  const choices = deliveryChoices(order.deliveryOptions);
  if (method === "delivery" && !choices.delivery) throw new ValidationError("This seller only offers pickup for this order.");
  if (method === "pickup" && !choices.pickup) throw new ValidationError("This seller only offers delivery for this order.");
  if (order.deliveryLocked && method !== order.deliveryMethod) {
    throw new ValidationError(
      "You've already started paying with " + (order.deliveryMethod === "pickup" ? "pickup" : "delivery") +
        ", so that can't change now. You can still update the address."
    );
  }

  const address = method === "delivery" ? normalizeAddress(input.address) : null;

  // Delivery: the seller's shipping settings price it for this address
  // (lib/shipping). The server works the fee out; nothing from the browser
  // is taken as an amount.
  let option: ShippingOption | null = null;
  let packageWeightG: number | null = null;
  if (address) {
    const quote = await quoteOrderShipping(order, { state: address.state, area: address.area });
    if (!quote.ok) throw new ValidationError(`${quote.message} Choose pickup if you can, or message the seller.`);
    option = (typeof input.optionId === "string" && quote.options.find((o) => o.id === input.optionId)) || null;
    if (!option) {
      if (typeof input.optionId === "string" && input.optionId) throw new ValidationError("That delivery option isn't available any more. Choose again.");
      option = quote.options[0];
    }
    packageWeightG = quote.weightG;
  }

  // Pickup: from one of the seller's pickup locations, when they've set any.
  let pickup: SellerLocation | null = null;
  if (method === "pickup") {
    const locations = await pickupLocationsForSeller(order.sellerId);
    if (locations.length > 0) {
      pickup = locations.find((l) => l.id === input.pickupLocationId) ?? (locations.length === 1 ? locations[0] : null);
      if (!pickup) throw new ValidationError("Choose where you'll pick it up.");
    }
  }

  const { deliveryFee, price } = orderPriceFor(order.itemPrice, method, option?.fee ?? 0);
  // Once paying has started, the price is fixed: an address that would
  // change the delivery fee can't be switched to now.
  if (order.deliveryLocked && deliveryFee !== order.deliveryFee) {
    throw new ValidationError("Delivery to that address costs a different amount, and you've already started paying. Keep the current address, or cancel and order again.");
  }

  const db = getDb();
  let query = db
    .from("orders")
    .update({
      item_price: order.itemPrice,
      delivery_method: method,
      delivery_fee: deliveryFee,
      price,
      delivery_address: address,
      // What was chosen, frozen with the price (docs/SHIPPING.md).
      shipping_option: option ? { ...option, address: { state: address?.state, area: address?.area } } : null,
      pickup_location: pickup
        ? { id: pickup.id, name: pickup.name, address: pickup.address, area: pickup.area, state: pickup.state, phone: pickup.phone, hours: pickup.pickupHours, instructions: pickup.pickupInstructions }
        : null,
      pickup_status: method === "pickup" ? "awaiting" : null,
      package_weight_g: packageWeightG,
    })
    .eq("id", orderId)
    .neq("payment_status", "paid")
    // Only if nothing moved underneath us: the same price we read, and (for
    // an order not yet locked) still not locked. A checkout starting at the
    // same moment either locks first (and this matches no row) or after (and
    // locks this new price). Never a payment at one price for another.
    .eq("price", order.price);
  if (!order.deliveryLocked) query = query.eq("delivery_locked", false);
  const result = await query.select().maybeSingle();
  const row = assertNoError(result, "saving delivery details") as Row | null;
  if (!row) throw new ValidationError("This order just changed. Refresh and try again.");

  if (address) {
    const saved = await db.from("users").update({ saved_delivery_address: address }).eq("id", userId);
    // Only a convenience for next time: never fail the checkout over it.
    if (saved.error) console.error("[delivery] couldn't save the buyer's address", saved.error.message);
  }
  return rowToOrder(row);
}

// Fixes the delivery method and price the moment checkout starts (see
// setOrderDelivery). Conditional on the price the caller is about to charge,
// so it only succeeds if that's still the order's price. Returns false if
// the order changed, or has no delivery method chosen yet.
export async function lockOrderDelivery(orderId: string, price: number): Promise<boolean> {
  const db = getDb();
  const result = await db
    .from("orders")
    .update({ delivery_locked: true })
    .eq("id", orderId)
    .eq("price", price)
    .not("delivery_method", "is", null)
    .select("id")
    .maybeSingle();
  return Boolean(assertNoError(result, "locking delivery choice"));
}

// Advances an order to the next fulfillment status. Callers pass the target
// status explicitly (rather than always "next") so a seller can also jump
// straight to "Delivered" for a pickup-style order; going backwards isn't
// allowed. Reaching "Delivered" makes the order reviewable.
// Pure — validates a status transition without touching the database, so
// the forward-only rule is unit-testable on its own.
export function validateStatusTransition(currentStatus: string, nextStatus: string): void {
  if (!ORDER_STATUSES.includes(nextStatus as (typeof ORDER_STATUSES)[number])) {
    throw new ValidationError("Invalid order status.");
  }
  const currentIdx = ORDER_STATUSES.indexOf(currentStatus as (typeof ORDER_STATUSES)[number]);
  const nextIdx = ORDER_STATUSES.indexOf(nextStatus as (typeof ORDER_STATUSES)[number]);
  if (currentIdx !== -1 && nextIdx < currentIdx) {
    throw new ValidationError("Can't move an order backwards.");
  }
}

// The last step belongs to the buyer. A seller can carry an order as far as
// "Out for delivery"; only the person who paid can say it actually arrived,
// which is what confirmDelivery does. Without this a seller could mark an
// undelivered item "Delivered" and release their own escrow.
export const SELLER_SETTABLE_STATUSES = ORDER_STATUSES.filter((s) => s !== "Delivered");

export function assertSellerCanSetStatus(nextStatus: string): void {
  if (nextStatus === "Delivered") {
    throw new ValidationError(
      "Only the buyer can mark an order delivered — they confirm it in the app once it arrives."
    );
  }
}

const STATUS_NOTIFICATION_COPY: Record<string, { title: string; body: (item: string) => string }> = {
  "Seller preparing": { title: "Order update", body: (item) => `"${item}" is now being prepared by the seller.` },
  "Dispatched": { title: "Your order has shipped", body: (item) => `"${item}" was dispatched — it's on its way.` },
  "Out for delivery": { title: "Out for delivery", body: (item) => `"${item}" is out for delivery today.` },
  // "Delivered" is reached through confirmDelivery (the buyer's own action),
  // so there is no buyer notification to send for it.
};

export async function updateOrderStatus(id: string, status: string, tracking?: TrackingInput | null): Promise<Order | null> {
  validateStatusTransition("", status); // checks `status` is a known one; "" skips the forward-only check
  const existing = await getOrder(id);
  if (!existing) return null;
  validateStatusTransition(existing.status, status);

  // A seller can't move an order past "Awaiting payment" until it's
  // actually been paid for — otherwise this would let a seller mark an
  // unpaid order "Dispatched" with nothing backing it. Real-money
  // confirmation only ever comes from the Paystack webhook (see
  // lib/payments.ts#confirmOrderPayment), never from this endpoint.
  if (status !== "Awaiting payment" && existing.paymentStatus !== "paid") {
    throw new ValidationError("This order hasn't been paid for yet.");
  }

  const db = getDb();
  const update: Record<string, unknown> = { status };
  // Set once, the moment an order first reaches Dispatched (or skips
  // straight to a later status) — the anchor autoReleaseStaleDeliveries
  // below counts its 7-day window from. Never overwritten after that: a
  // seller can't reset the buyer's clock by re-saving a later status.
  if (!existing.dispatchedAt && ORDER_STATUSES.indexOf(status as (typeof ORDER_STATUSES)[number]) >= ORDER_STATUSES.indexOf("Dispatched")) {
    update.dispatched_at = new Date().toISOString();
  }
  // For a pickup order, "Dispatched" means it's ready to collect.
  const pickup = existing.deliveryMethod === "pickup";
  if (pickup && status === "Dispatched") update.pickup_status = "ready";
  const result = await db
    .from("orders")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  const row = assertNoError(result, "updating order status") as Row;
  const order = rowToOrder(row);

  // Let the buyer know their order moved forward — best-effort: a
  // notification failure shouldn't undo or block the status update itself.
  const copy = STATUS_NOTIFICATION_COPY[status];
  if (pickup && status === "Dispatched") {
    const where = order.pickupLocation ? `${order.pickupLocation.name}, ${order.pickupLocation.address}, ${order.pickupLocation.area}` : "the seller's";
    await notifyBestEffort({
      userId: order.userId,
      type: "delivery",
      title: "Ready to collect",
      body: `"${order.item}" is ready to collect at ${where}.${order.pickupLocation?.hours ? ` Open ${order.pickupLocation.hours}.` : ""}`,
      sms: `FindIt: "${shortItem(order.item)}" is ready to collect at ${where}. Confirm in FindIt once you have it.`,
    });
  } else if (copy) {
    await notifyBestEffort({
      userId: order.userId,
      type: "delivery",
      title: copy.title,
      body: copy.body(order.item),
      ...(status === "Dispatched"
        ? { sms: `FindIt: Your order "${shortItem(order.item)}" from ${order.seller} is on its way. Confirm in FindIt once it arrives.` }
        : {}),
    });
  }

  // The shipment and its tracking follow the order (lib/shipping/shipments.ts).
  if (!pickup && (status === "Dispatched" || status === "Out for delivery")) {
    try {
      await recordShipmentEvent(
        order,
        status === "Dispatched" ? "in_transit" : "out_for_delivery",
        status === "Dispatched" ? "Sent out by the seller" : "Out for delivery",
        { tracking }
      );
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      console.error("[shipping] couldn't record tracking for", id, err);
    }
  }

  return order;
}

/* ------------------------------------------------------------------ */
/*  Delivery confirmation and escrow                                     */
/* ------------------------------------------------------------------ */

// The buyer says the order arrived. This is the step the whole escrow promise
// rests on: it is the only path to "Delivered", the only thing that releases
// the money, and the only thing that unlocks a review.
export async function confirmDelivery(id: string, userId: string): Promise<Order | null> {
  const existing = await getOrder(id);
  if (!existing || existing.userId !== userId) return null;
  if (existing.buyerConfirmedAt) {
    throw new ValidationError("You've already confirmed this order.");
  }
  if (existing.status === "Awaiting payment" || existing.status === "Seller preparing") {
    throw new ValidationError("Wait until the seller has dispatched your order before confirming it arrived.");
  }
  if (existing.escrowStatus === "refunded") {
    throw new ValidationError("This order was refunded, so it can't be confirmed as delivered.");
  }
  // Releasing escrow on an order nobody paid for would schedule a payout of
  // money FindIt never collected. The status checks above only prove the
  // seller said they dispatched it, which is not the same thing — an order
  // created before the payment flow existed, or one advanced by a seller
  // while the charge was still pending, reaches here unpaid. Migration 021
  // also refuses this at the database level; this check exists so the buyer
  // gets an explanation instead of a constraint violation.
  if (existing.paymentStatus !== "paid") {
    throw new ValidationError(
      "This order hasn't been paid for yet, so there's nothing to release. Pay for it first, then confirm delivery."
    );
  }

  const now = new Date().toISOString();
  const db = getDb();
  // Conditional on escrow_status still being whatever this function just
  // read it as (held, or disputed if this confirmation is settling the
  // buyer's own earlier report) — not just buyer_confirmed_at being null.
  // reportOrderIssue below writes the SAME row on a DIFFERENT column
  // (issue_reported_at) with its own independent null-guard, so a buyer
  // who fires both actions close together (two tabs, a double-tap across
  // adjacent buttons) could previously have BOTH succeed: this call
  // releases escrow and triggers a real Paystack payout, while
  // reportOrderIssue's write lands after and flips escrow_status to
  // 'disputed' — leaving the seller already paid on an order that now
  // reads as an open dispute an admin might refund too. Gating both
  // functions' writes on escrow_status itself (matched against exactly
  // what each one read) makes them mutually exclusive: whichever commits
  // first moves escrow_status away from the value the other is still
  // conditioned on, so the second write matches zero rows and fails clean.
  const result = await db
    .from("orders")
    .update({
      status: "Delivered",
      buyer_confirmed_at: now,
      escrow_status: "released",
      can_review: true,
      // Confirming receipt settles any problem the buyer had raised earlier.
      issue_reported_at: null,
      issue_note: null,
    })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("escrow_status", existing.escrowStatus)
    .is("buyer_confirmed_at", null)
    .select()
    .maybeSingle();
  const row = assertNoError(result, "confirming delivery") as Row | null;
  if (!row) {
    throw new ValidationError(
      "This order's status just changed (already confirmed, or a report came in first) — refresh and try again."
    );
  }
  const order = rowToOrder(row);

  // The one moment an order is genuinely complete. Creating the verified
  // record HERE, rather than in the route, means any future release path
  // gets one automatically. Never throws: a completion the buyer has already
  // been shown must not fail because a record couldn't be written.
  await recordCompletedTransaction(order);

  // order.sellerId when available (unambiguous) — see notifySellerOfNewOrder's
  // comment above for why a bare business-name lookup here is a real bug,
  // not just a style preference: it throws on a name collision, which would
  // propagate out of whichever order-lifecycle step this is and fail an
  // action that had already succeeded (the review/confirmation/report/
  // resolution itself is saved before this notification runs).
  const seller = order.sellerId
    ? await findUserForSellerId(order.sellerId)
    : await findUserByBusinessName(order.seller);
  if (seller) {
    await notifyBestEffort({
      userId: seller.id,
      type: "delivery",
      title: "Delivery confirmed",
      body: `The buyer confirmed they received "${order.item}". Your payment has been released.`,
    });
  }

  // Tracking ends here: delivered, or collected for a pickup order.
  try {
    if (order.deliveryMethod === "pickup") {
      await getDb().from("orders").update({ pickup_status: "collected" }).eq("id", order.id);
      order.pickupStatus = "collected";
    } else if (order.dispatchedAt) {
      await recordShipmentEvent(order, "delivered", "The buyer confirmed it arrived", { source: "system" });
    }
  } catch (err) {
    console.error("[shipping] couldn't close tracking for", order.id, err);
  }

  return order;
}

// How many days after an order reaches 'Dispatched' with no buyer action
// (no confirmation, no reported problem) before escrow auto-releases to
// the seller. Long enough for a real delivery delay within Nigeria; short
// enough that a seller isn't waiting indefinitely for money they're owed —
// matches the window most Nigerian marketplace/escrow platforms use.
export const AUTO_RELEASE_STALE_DAYS = 7;

// Run daily from app/api/cron/expirations — closes the gap a correctly-
// dispatched order used to leave open forever if the buyer simply never
// confirmed AND never reported a problem: nothing else in this app ever
// paid the seller in that case. Treats "no objection within
// AUTO_RELEASE_STALE_DAYS of dispatch" as implicit confirmation and
// applies the exact same effects confirmDelivery does (the buyer's
// recourse — a post-release report — stays open the same
// POST_CONFIRMATION_REPORT_WINDOW_MS either way), rather than inventing a
// separate "auto" state nothing else in the app would understand.
// Returns the released orders (not just their ids) so the caller — the
// cron route, not this file — can trigger each one's real payout via
// lib/payments.ts#initiateSellerPayout without this module importing that
// one back (payments.ts already imports from repo.ts).
export async function autoReleaseStaleDeliveries(): Promise<Order[]> {
  const db = getDb();
  const cutoff = new Date(Date.now() - AUTO_RELEASE_STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const staleResult = await db
    .from("orders")
    .select("*")
    .eq("payment_status", "paid")
    .eq("escrow_status", "held")
    .is("buyer_confirmed_at", null)
    .is("issue_reported_at", null)
    .not("dispatched_at", "is", null)
    .lte("dispatched_at", cutoff)
    .limit(100);
  const staleRows = assertNoError(staleResult, "listing stale dispatched orders") as Row[];

  const released: Order[] = [];
  for (const row of staleRows) {
    const now = new Date().toISOString();
    // Same CAS pattern as confirmDelivery's own update — conditioned on
    // escrow_status/buyer_confirmed_at still matching what the listing
    // query above just read, so a buyer confirming (or reporting a
    // problem) in the gap between that read and this write wins cleanly
    // instead of racing this sweep.
    const releaseResult = await db
      .from("orders")
      .update({
        status: "Delivered",
        buyer_confirmed_at: now,
        escrow_status: "released",
        can_review: true,
      })
      .eq("id", row.id as string)
      .eq("escrow_status", "held")
      .is("buyer_confirmed_at", null)
      .select()
      .maybeSingle();
    const releasedRow = assertNoError(releaseResult, "auto-releasing a stale delivery") as Row | null;
    if (!releasedRow) continue; // lost the race to the buyer's own action — skip, not an error

    const order = rowToOrder(releasedRow);
    released.push(order);

    // Same completion record every other release path writes — never
    // throws, matching confirmDelivery's own reasoning: a release that
    // already committed must not fail because the record couldn't be.
    await recordCompletedTransaction(order);

    const seller = order.sellerId
      ? await findUserForSellerId(order.sellerId)
      : await findUserByBusinessName(order.seller);
    if (seller) {
      await notifyBestEffort({
        userId: seller.id,
        type: "delivery",
        title: "Delivery confirmed",
        body: `"${order.item}" was auto-confirmed after ${AUTO_RELEASE_STALE_DAYS} days with no reported issue. Your payment has been released.`,
      });
    }
    await notifyBestEffort({
      userId: order.userId,
      type: "delivery",
      title: "Order marked delivered",
      body: `We marked "${order.item}" as delivered — it's been ${AUTO_RELEASE_STALE_DAYS} days since it was dispatched with no reported issue. If something's wrong, contact support.`,
    });
  }

  return released;
}

// How long after confirming delivery a buyer may still report a problem.
// Confirming isn't the end of a buyer's recourse — a dead-on-arrival item or
// a wrong item can surface days later — but it can't stay open forever, both
// so a stale claim can't reopen an old order and because the seller may
// already have been paid out by then (initiateSellerPayout fires right after
// confirmation). refundOrderPayment is what actually guards against a
// double-loss if that's already happened; this window just bounds how often
// that situation can even come up.
const POST_CONFIRMATION_REPORT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// The buyer says something is wrong. This deliberately does NOT complete the
// order or release anything — it parks the money and puts the order in front
// of an admin, which is the whole point of holding it in the first place.
export async function reportOrderIssue(
  id: string,
  userId: string,
  note: string
): Promise<Order | null> {
  const trimmed = note.trim();
  if (trimmed.length < 5) {
    throw new ValidationError("Tell us briefly what went wrong so we can help.");
  }
  if (trimmed.length > 1000) {
    throw new ValidationError("Please keep the description under 1000 characters.");
  }

  const existing = await getOrder(id);
  if (!existing || existing.userId !== userId) return null;
  if (existing.escrowStatus === "released") {
    const confirmedAt = existing.buyerConfirmedAt ? new Date(existing.buyerConfirmedAt).getTime() : NaN;
    const withinWindow = !Number.isNaN(confirmedAt) && Date.now() - confirmedAt <= POST_CONFIRMATION_REPORT_WINDOW_MS;
    if (!withinWindow) {
      throw new ValidationError("The window to report a problem after confirming delivery has passed — message the seller or contact support.");
    }
  }
  if (existing.escrowStatus === "refunded") {
    throw new ValidationError("This order has already been refunded.");
  }
  if (existing.issueReportedAt) {
    throw new ValidationError("You've already reported a problem with this order — we're looking into it.");
  }

  const db = getDb();
  // Conditional on escrow_status still matching exactly what was just read
  // above (held, or released-and-within-window) — see the matching comment
  // on confirmDelivery's own update for why this, not just
  // issue_reported_at being null, is what actually makes these two
  // functions mutually exclusive under a race: whichever of the two
  // commits first moves escrow_status away from the value this call is
  // still conditioned on, so a losing concurrent report fails clean here
  // instead of landing after a payout already went out.
  const result = await db
    .from("orders")
    .update({
      escrow_status: "disputed",
      issue_reported_at: new Date().toISOString(),
      issue_note: trimmed,
    })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("escrow_status", existing.escrowStatus)
    .is("issue_reported_at", null)
    .select()
    .maybeSingle();
  const row = assertNoError(result, "reporting an order problem") as Row | null;
  if (!row) {
    throw new ValidationError(
      "This order's status just changed (already confirmed or reported) — refresh and try again."
    );
  }

  // A post-confirmation report (see the window check above) disputes a
  // transaction record that already exists and reads 'completed' — this is
  // what moves it to 'disputed' and appends the event, same as any other
  // dispute. A pre-confirmation report has no record yet, so this is a no-op
  // (transitionStatus finds nothing to update), exactly as before.
  await markTransactionDisputed(id, userId, trimmed);
  const order = rowToOrder(row);

  // order.sellerId when available (unambiguous) — see notifySellerOfNewOrder's
  // comment above for why a bare business-name lookup here is a real bug,
  // not just a style preference: it throws on a name collision, which would
  // propagate out of whichever order-lifecycle step this is and fail an
  // action that had already succeeded (the review/confirmation/report/
  // resolution itself is saved before this notification runs).
  const seller = order.sellerId
    ? await findUserForSellerId(order.sellerId)
    : await findUserByBusinessName(order.seller);
  if (seller) {
    await notifyBestEffort({
      userId: seller.id,
      type: "delivery",
      title: "A buyer reported a problem",
      body: `The buyer raised an issue with "${order.item}". FindIt is holding the payment while we review it.`,
    });
  }

  return order;
}

// Every order with an open problem, newest first — this is the admin queue.
export async function listDisputedOrders(): Promise<Order[]> {
  const db = getDb();
  const result = await db
    .from("orders")
    .select("*")
    .eq("escrow_status", "disputed")
    .order("issue_reported_at", { ascending: false });
  const rows = assertNoError(result, "listing reported orders") as Row[];
  return rows.map(rowToOrder);
}

// An admin decides who was right. "released" pays the seller, "refunded"
// returns the money to the buyer; both close the report either way.
export async function resolveOrderIssue(
  id: string,
  outcome: "released" | "refunded"
): Promise<Order | null> {
  if (outcome !== "released" && outcome !== "refunded") {
    throw new ValidationError("Resolution must be either released or refunded.");
  }
  const existing = await getOrder(id);
  if (!existing) return null;
  if (existing.escrowStatus !== "disputed") {
    throw new ValidationError("There's no open problem on that order.");
  }
  // Same reasoning as confirmDelivery: "released" pays the seller, and an
  // order can be disputed without ever having been paid. Refunding one is
  // still allowed — it closes the report and returns the buyer to a truthful
  // state — but releasing it would pay out money that was never collected.
  if (outcome === "released" && existing.paymentStatus !== "paid") {
    throw new ValidationError(
      "This order was never paid for, so there are no funds to release. Resolve it as refunded instead."
    );
  }

  const db = getDb();
  const result = await db
    .from("orders")
    .update({
      escrow_status: outcome,
      issue_reported_at: null,
      // The buyer's description is kept so the decision stays explainable.
      ...(outcome === "released"
        ? { status: "Delivered", buyer_confirmed_at: existing.buyerConfirmedAt ?? new Date().toISOString(), can_review: true }
        : {}),
    })
    .eq("id", id)
    .eq("escrow_status", "disputed")
    .select()
    .maybeSingle();
  const row = assertNoError(result, "resolving an order problem") as Row | null;
  if (!row) throw new ValidationError("That problem has already been resolved.");
  const order = rowToOrder(row);

  if (outcome === "released") {
    // A dispute settled in the seller's favour is a real completion, so it
    // earns a real record — and the history says it was disputed first
    // rather than presenting it as an uneventful sale.
    await recordCompletedTransaction(order);
    await markTransactionDisputeResolved(id, null, "Dispute resolved in the seller's favour.");
  } else {
    await markTransactionRefunded(id, null, "Refunded after a reported problem.");
    // Never left the seller: back on sale. (Something that was delivered
    // and refunded isn't automatically sellable again.)
    if (!order.dispatchedAt) await restockSafely(order);
  }

  await notifyBestEffort({
    userId: order.userId,
    type: "delivery",
    title: outcome === "refunded" ? "Your refund was approved" : "Your reported problem was reviewed",
    body:
      outcome === "refunded"
        ? `FindIt reviewed your report on "${order.item}" and approved a refund.`
        : `FindIt reviewed your report on "${order.item}" and released the payment to the seller.`,
    ...(outcome === "refunded"
      ? { sms: `FindIt: Your refund for "${shortItem(order.item)}" was approved. ₦${order.price.toLocaleString("en-NG")} is on its way back to you.` }
      : {}),
  });

  // order.sellerId when available (unambiguous) — see notifySellerOfNewOrder's
  // comment above for why a bare business-name lookup here is a real bug,
  // not just a style preference: it throws on a name collision, which would
  // propagate out of whichever order-lifecycle step this is and fail an
  // action that had already succeeded (the review/confirmation/report/
  // resolution itself is saved before this notification runs).
  const seller = order.sellerId
    ? await findUserForSellerId(order.sellerId)
    : await findUserByBusinessName(order.seller);
  if (seller) {
    await notifyBestEffort({
      userId: seller.id,
      type: "delivery",
      title: outcome === "refunded" ? "An order was refunded" : "A reported problem was resolved",
      body:
        outcome === "refunded"
          ? `FindIt refunded the buyer for "${order.item}".`
          : `FindIt released your payment for "${order.item}".`,
    });
  }

  return order;
}

/* ------------------------------------------------------------------ */
/*  Notifications                                                        */
/* ------------------------------------------------------------------ */

function rowToNotification(row: Row): Notification {
  return {
    id: row.id as string,
    type: row.type as string,
    title: row.title as string,
    body: row.body as string,
    unread: Boolean(row.unread),
    time: timeAgo(row.created_at as string),
  };
}

export async function listNotifications(userId: string): Promise<Notification[]> {
  const db = getDb();
  const result = await db
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const rows = assertNoError(result, "listing notifications") as Row[];
  return rows.map(rowToNotification);
}

export async function createNotification(input: {
  userId: string;
  type: string;
  title: string;
  body: string;
}): Promise<Notification> {
  const db = getDb();
  const id = "n_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const result = await db
    .from("notifications")
    .insert({ id, user_id: input.userId, type: input.type, title: input.title, body: input.body })
    .select()
    .single();
  const row = assertNoError(result, "creating notification") as Row;
  // The same alert as a phone notification, on every device where this user
  // turned alerts on (lib/outsideAlerts.ts). Never fails the notification.
  await sendPushToUser(input.userId, { title: input.title, body: input.body, tag: input.type });
  return rowToNotification(row);
}

// Same as createNotification, but for notifications that are a side effect
// of some other action succeeding (a new order landed, a status changed) —
// the primary action has already committed, so a notification failure here
// should be logged, not surfaced as a failure of that action.
export async function notifyBestEffort(input: {
  userId: string;
  type: string;
  title: string;
  body: string;
  // Also send this as a text message (SMS/WhatsApp, lib/alerts.ts). Only for
  // alerts about money someone has to act on: each one costs a little.
  sms?: string;
}): Promise<void> {
  try {
    const db = getDb();
    const prefResult = await db
      .from("users")
      .select("notifications_enabled")
      .eq("id", input.userId)
      .maybeSingle();
    const pref = assertNoError(prefResult, "checking notification preference") as Row | null;
    if (pref && pref.notifications_enabled === false) return;
    // Side by side: a money alert's text still goes out if saving the in-app
    // notification fails, and the other way round.
    const [saved] = await Promise.allSettled([
      createNotification({ userId: input.userId, type: input.type, title: input.title, body: input.body }),
      input.sms ? sendTextAlert(input.userId, input.sms) : Promise.resolve(),
    ]);
    if (saved.status === "rejected") throw saved.reason;
  } catch (err) {
    console.error("[notify] failed to create notification:", err);
  }
}

export async function markNotificationRead(id: string, userId: string): Promise<Notification | null> {
  const db = getDb();
  const result = await db
    .from("notifications")
    .update({ unread: false })
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .maybeSingle();
  const row = assertNoError(result, "marking notification read") as Row | null;
  return row ? rowToNotification(row) : null;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const db = getDb();
  const result = await db.from("notifications").update({ unread: false }).eq("user_id", userId);
  assertNoError(result, "marking all notifications read");
}

/* ------------------------------------------------------------------ */
/*  Sellers (admin verification queue)                                  */
/* ------------------------------------------------------------------ */

function rowToSeller(row: Row): Seller {
  const userRow = row.users as Row | null;
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    phone: (userRow?.phone as string | undefined) ?? null,
    status: row.status as SellerStatus,
    statusReason: (row.status_reason as string | null) ?? null,
    storeSlug: (row.store_slug as string | null) ?? null,
    storeSlugClaimedAt: (row.store_slug_claimed_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function listSellers(): Promise<Seller[]> {
  const db = getDb();
  // sellers has two foreign keys into users (user_id, and
  // verification_reviewed_by) — an unqualified `users(phone)` embed is
  // ambiguous and PostgREST rejects the whole query rather than guessing,
  // so this whole call (the admin Sellers tab) threw on every real load.
  const result = await db
    .from("sellers")
    .select("*, users!sellers_user_id_fkey(phone)")
    .order("created_at", { ascending: false });
  const rows = assertNoError(result, "listing sellers") as Row[];
  return rows.map(rowToSeller);
}

// Bulk, one-query version of countActiveProducts (lib/subscriptions.ts) —
// for the admin seller list, which needs every seller's count at once, not
// one at a time. Keyed by seller_id, so a listing with no seller_id yet
// (pre-migration-009 data) just doesn't contribute to any seller's count
// rather than throwing.
export async function activeProductCountsBySeller(): Promise<Map<string, number>> {
  const db = getDb();
  const result = await db
    .from("products")
    .select("seller_id")
    .eq("active", true)
    .not("seller_id", "is", null);
  const rows = assertNoError(result, "counting active listings by seller") as Row[];
  const counts = new Map<string, number>();
  for (const row of rows) {
    const sellerId = row.seller_id as string;
    counts.set(sellerId, (counts.get(sellerId) ?? 0) + 1);
  }
  return counts;
}

// Real counts for the admin overview — one query per lifecycle status,
// nothing inferred or cached.
export async function getSellerStatusCounts(): Promise<{ pending: number; approved: number; rejected: number; suspended: number }> {
  const db = getDb();
  const [pending, approved, rejected, suspended] = await Promise.all([
    db.from("sellers").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("sellers").select("id", { count: "exact", head: true }).eq("status", "approved"),
    db.from("sellers").select("id", { count: "exact", head: true }).eq("status", "rejected"),
    db.from("sellers").select("id", { count: "exact", head: true }).eq("status", "suspended"),
  ]);
  for (const [label, result] of [["pending", pending], ["approved", approved], ["rejected", rejected], ["suspended", suspended]] as const) {
    if (result.error) throw new Error(`counting ${label} sellers: ${result.error.message}`);
  }
  return {
    pending: pending.count ?? 0,
    approved: approved.count ?? 0,
    rejected: rejected.count ?? 0,
    suspended: suspended.count ?? 0,
  };
}

// Real count for the admin overview — orders a buyer flagged that no admin
// has resolved yet (see resolveOrderIssue, which clears escrow_status off
// 'disputed').
export async function countDisputedOrders(): Promise<number> {
  const db = getDb();
  const result = await db.from("orders").select("id", { count: "exact", head: true }).eq("escrow_status", "disputed");
  if (result.error) throw new Error(`counting disputed orders: ${result.error.message}`);
  return result.count ?? 0;
}

// Used to gate every restricted seller action (new listings, uploads,
// offers) against the seller's real lifecycle state — otherwise an admin's
// approve/reject/suspend click has no actual effect, since role alone
// (checked everywhere else) doesn't change with seller status. Returns null
// for a non-seller (e.g. an admin), which correctly never matches
// 'approved' below.
export async function getSellerStatusForUser(userId: string): Promise<SellerStatus | null> {
  const db = getDb();
  const result = await db.from("sellers").select("status").eq("user_id", userId).maybeSingle();
  const row = assertNoError(result, "checking seller status") as Row | null;
  return (row?.status as SellerStatus | undefined) ?? null;
}

// The single source of truth for "can this seller take a restricted action
// right now" — replaces three previously-separate inline
// `status === "rejected"` checks (uploads, listings, offers), each of which
// silently let a 'pending' seller through since pending only differed from
// approved in the admin's own head, not in enforced behavior. Pure and unit
// tested: only 'approved' passes; pending/rejected/suspended each get a
// message that tells the seller what's actually going on, not a bare 403.
export function assertSellerCanTransact(status: SellerStatus | null): void {
  if (status === "approved") return;
  if (status === "pending") {
    throw new ValidationError("Your seller account is still under review — you can list and sell once it's approved.");
  }
  if (status === "suspended") {
    throw new ValidationError("Your seller account is suspended — contact FindIt support for details.");
  }
  if (status === "rejected") {
    throw new ValidationError("Your seller account isn't approved to do that.");
  }
  throw new ValidationError("Seller account not found.");
}

// The caller's own sellers.id — looked up by the API routes that create a
// listing or an offer, so the reliable seller_id (migration 009) can be
// dual-written alongside the existing text business name. Null for a seller
// account that somehow has no sellers row yet (shouldn't happen given
// createUser/becomeSeller always create one, but this is a lookup, not an
// assumption, so it degrades to "no seller_id recorded" rather than throwing).
export async function getSellerBrandingForUser(
  userId: string
): Promise<{ logoUrl: string | null; bannerUrl: string | null; storeTemplate: string; storeAccent: string } | null> {
  const db = getDb();
  const result = await db
    .from("sellers")
    .select("logo_url, banner_url, store_template, store_accent")
    .eq("user_id", userId)
    .maybeSingle();
  const row = assertNoError(result, "loading store branding") as Row | null;
  if (!row) return null;
  return {
    logoUrl: (row.logo_url as string | null) ?? null,
    bannerUrl: (row.banner_url as string | null) ?? null,
    storeTemplate: (row.store_template as string | null) ?? "classic",
    storeAccent: (row.store_accent as string | null) ?? "violet",
  };
}

export async function getSellerIdForUser(userId: string): Promise<string | null> {
  const db = getDb();
  const result = await db.from("sellers").select("id").eq("user_id", userId).maybeSingle();
  const row = assertNoError(result, "looking up seller id") as Row | null;
  return (row?.id as string | undefined) ?? null;
}

// Real backing for the "customization" Store subscription benefit — gated
// server-side (assertCanCustomizeStore) so a seller on a plan with no
// customization at all can't set these just by knowing the endpoint
// exists. logoUrl/bannerUrl null clears that image; undefined leaves it
// untouched. storeTemplate and storeAccent each get their OWN gate
// (assertCanUseStoreTemplate / assertCanUseStoreAccent), separate from
// assertCanCustomizeStore: passing that only proves the seller's plan
// unlocks SOME customization, not that it unlocks the SPECIFIC template or
// color they're asking for (see migrations 031/032).
export async function updateSellerBranding(
  sellerId: string,
  patch: { logoUrl?: string | null; bannerUrl?: string | null; storeTemplate?: string; storeAccent?: string }
): Promise<void> {
  if (patch.logoUrl !== undefined || patch.bannerUrl !== undefined) {
    await assertCanCustomizeStore(sellerId);
  }
  if (patch.storeTemplate !== undefined) {
    await assertCanUseStoreTemplate(sellerId, patch.storeTemplate);
  }
  if (patch.storeAccent !== undefined) {
    await assertCanUseStoreAccent(sellerId, patch.storeAccent);
  }

  const columns: Record<string, unknown> = {};
  if (patch.logoUrl !== undefined) columns.logo_url = patch.logoUrl;
  if (patch.bannerUrl !== undefined) columns.banner_url = patch.bannerUrl;
  if (patch.storeTemplate !== undefined) columns.store_template = patch.storeTemplate;
  if (patch.storeAccent !== undefined) columns.store_accent = patch.storeAccent;
  if (Object.keys(columns).length === 0) return;

  const db = getDb();
  const result = await db.from("sellers").update(columns).eq("id", sellerId);
  assertNoError(result, "updating store branding");
}

// Everywhere except here, `description` only ever changes as a side effect
// of submitVerification, which also resets verification_status to
// 'pending' — correct for the fields that actually describe the business
// (type, category, evidence), wrong for a seller who just wants to fix a
// typo in their bio, since it costs them their Verified/Trusted badge until
// an admin re-reviews. This updates the bio alone and never touches
// verification_status, so it's safe to expose regardless of whether the
// seller is pending, approved, or rejected.
const MAX_SELLER_DESCRIPTION_LENGTH = 2000;

export async function updateSellerDescription(sellerId: string, description: string | null): Promise<void> {
  const trimmed = description?.trim() || null;
  if (trimmed && trimmed.length > MAX_SELLER_DESCRIPTION_LENGTH) {
    throw new ValidationError(`Bio must be under ${MAX_SELLER_DESCRIPTION_LENGTH} characters.`);
  }
  const db = getDb();
  const result = await db.from("sellers").update({ description: trimmed }).eq("id", sellerId);
  assertNoError(result, "updating seller description");
}

export async function setSellerStatus(id: string, status: SellerStatus, reason: string | null = null): Promise<Seller | null> {
  if ((status === "rejected" || status === "suspended") && !reason?.trim()) {
    throw new ValidationError("Give the seller a reason — never a silent rejection or suspension.");
  }
  const db = getDb();
  // Same ambiguous-embed issue as listSellers above, but worse here: the
  // embed is resolved as part of the SAME request as the update (Postgrest's
  // `return=representation`), so an unqualified `users(phone)` didn't just
  // break what came back — it rejected the whole PATCH, meaning approving,
  // rejecting, or suspending a seller through this path never actually
  // applied the status change at all.
  const result = await db
    .from("sellers")
    .update({ status, status_reason: status === "approved" || status === "pending" ? null : reason!.trim() })
    .eq("id", id)
    .select("*, users!sellers_user_id_fkey(phone)")
    .maybeSingle();
  const row = assertNoError(result, "updating seller status") as Row | null;
  if (!row) return null;
  const seller = rowToSeller(row);

  const NOTIFY: Record<SellerStatus, { title: string; body: string } | null> = {
    pending: null,
    approved: {
      title: "You're approved to sell",
      body: "Your seller account has been approved — you can now list products and respond to requests. Add your payout bank account in Store settings so you get paid automatically the moment a buyer confirms delivery.",
    },
    rejected: { title: "Seller application update", body: `Your seller application wasn't approved: ${reason}` },
    suspended: { title: "Your seller account is suspended", body: `FindIt has suspended your selling privileges: ${reason}` },
  };
  const notification = NOTIFY[status];
  if (notification) {
    await notifyBestEffort({ userId: seller.userId, type: "seller", ...notification });
  }

  return seller;
}

/* ------------------------------------------------------------------ */
/*  Admin action audit log — who did what, to what, and when. Covers    */
/*  destructive/high-impact admin actions specifically (seller approve/ */
/*  reject today). Best-effort: a logging failure never blocks the      */
/*  actual admin action, since it's a record of the action, not a gate. */
/* ------------------------------------------------------------------ */

export async function logAdminAction(input: {
  adminId: string;
  action: string;
  targetType: string;
  targetId: string;
  detail?: Record<string, unknown> | null;
}): Promise<void> {
  const db = getDb();
  const id = randomId("aa_");
  const result = await db.from("admin_actions").insert({
    id,
    admin_id: input.adminId,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId,
    detail: input.detail ?? null,
  });
  if (result.error) {
    // Don't let a logging failure block or fail the admin action itself —
    // just make sure it's visible server-side instead of silently lost.
    console.error("[admin-action-log] failed to record:", result.error.message);
  }
}

export type AdminActionLog = {
  id: string;
  adminId: string;
  adminName: string | null;
  action: string;
  targetType: string;
  targetId: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

export async function listAdminActions(limit = 100): Promise<AdminActionLog[]> {
  const db = getDb();
  const result = await db
    .from("admin_actions")
    .select("*, users(name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = assertNoError(result, "listing admin actions") as Row[];
  return rows.map((row) => {
    const adminRow = row.users as Row | null;
    return {
      id: row.id as string,
      adminId: row.admin_id as string,
      adminName: (adminRow?.name as string | undefined) ?? null,
      action: row.action as string,
      targetType: row.target_type as string,
      targetId: row.target_id as string,
      detail: (row.detail as Record<string, unknown> | null) ?? null,
      createdAt: row.created_at as string,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Requests / offers                                                   */
/* ------------------------------------------------------------------ */

function rowToOffer(row: Row, stats: SellerStats): Offer {
  return {
    id: row.id as string,
    requestId: row.request_id as string,
    seller: row.seller as string,
    price: row.price as number,
    delivery: row.delivery as string,
    eta: row.eta as string,
    condition: row.condition as string,
    warranty: row.warranty as string,
    note: (row.note as string | null) ?? null,
    deliveryOption: (row.delivery_option as DeliveryOptions | null | undefined) ?? null,
    deliveryFee: (row.delivery_fee as number | null | undefined) ?? 0,
    accepted: Boolean(row.accepted),
    createdAt: row.created_at as string,
    verified: stats.verified,
    rating: stats.rating,
  };
}

export async function listOffersForRequest(requestId: string): Promise<Offer[]> {
  const db = getDb();
  const result = await db
    .from("offers")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });
  const rows = assertNoError(result, "listing offers") as Row[];
  const stats = await getSellerStatsMap();
  return rows.map((row) => rowToOffer(row, statsFor(stats, row.seller as string)));
}

function rowToRequest(row: Row, offerCount: number, customerName?: string | null, myOfferSent?: boolean): RequestRow {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    budgetMin: (row.budget_min as number | null) ?? null,
    budgetMax: (row.budget_max as number | null) ?? null,
    qty: row.qty as number,
    location: (row.location as string | null) ?? null,
    lat: (row.lat as number | null) ?? null,
    lng: (row.lng as number | null) ?? null,
    condition: row.condition as string,
    status: row.status as string,
    createdAt: row.created_at as string,
    posted: timeAgo(row.created_at as string),
    offerCount,
    customerName: customerName ?? null,
    myOfferSent,
  };
}

async function customerNamesFor(userIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (userIds.length === 0) return names;
  const db = getDb();
  const result = await db.from("users").select("id, name").in("id", userIds);
  const rows = assertNoError(result, "loading requester names") as Row[];
  for (const row of rows) names.set(row.id as string, row.name as string);
  return names;
}

async function offerCountsFor(requestIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (requestIds.length === 0) return counts;
  const db = getDb();
  const result = await db.from("offers").select("request_id").in("request_id", requestIds);
  const rows = assertNoError(result, "counting offers") as Row[];
  for (const row of rows) {
    const id = row.request_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

// Which of these requests the given seller has ALREADY sent an offer on —
// deliberately separate from offerCountsFor (every seller's offers
// combined). See listOpenRequests below for the real bug this exists to
// fix: a request with ANY offer on it, from ANY seller, used to read as
// "you already responded" for every OTHER seller too, silently hiding
// their own "Send offer" button on a request they'd never actually
// touched — breaking the core competitive-bidding mechanic (see
// components/findit-app/SellerDashboard.jsx) for every request that got a
// single response from anyone.
async function myOfferedRequestIds(requestIds: string[], sellerId: string): Promise<Set<string>> {
  if (requestIds.length === 0) return new Set();
  const db = getDb();
  const result = await db.from("offers").select("request_id").eq("seller_id", sellerId).in("request_id", requestIds);
  const rows = assertNoError(result, "checking your own offers") as Row[];
  return new Set(rows.map((r) => r.request_id as string));
}

// viewerSellerId is optional so an admin (who never sends offers) can still
// call this without it — myOfferSent is simply left undefined for them,
// which SellerDashboard.jsx never reads anyway (admins don't get that
// screen). A seller viewing this list always passes their own id.
export async function listOpenRequests(viewerSellerId?: string | null): Promise<RequestRow[]> {
  const db = getDb();
  const result = await db
    .from("requests")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  const rows = assertNoError(result, "listing open requests") as Row[];
  const requestIds = rows.map((r) => r.id as string);
  const [counts, names, mine] = await Promise.all([
    offerCountsFor(requestIds),
    customerNamesFor(rows.map((r) => r.user_id as string)),
    viewerSellerId ? myOfferedRequestIds(requestIds, viewerSellerId) : Promise.resolve(null),
  ]);
  return rows.map((row) =>
    rowToRequest(
      row,
      counts.get(row.id as string) ?? 0,
      names.get(row.user_id as string),
      mine ? mine.has(row.id as string) : undefined
    )
  );
}

// A buyer's own requests (any status), each with its real offers so they can
// see and accept whatever real sellers have sent — no more instant
// auto-generated offers.
export async function listMyRequests(userId: string): Promise<(RequestRow & { offers: Offer[] })[]> {
  const db = getDb();
  const result = await db
    .from("requests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const rows = assertNoError(result, "listing your requests") as Row[];
  const counts = await offerCountsFor(rows.map((r) => r.id as string));
  const requests = rows.map((row) => rowToRequest(row, counts.get(row.id as string) ?? 0));
  const withOffers = await Promise.all(
    requests.map(async (r) => ({ ...r, offers: await listOffersForRequest(r.id) }))
  );
  return withOffers;
}

/* ------------------------------------------------------------------ */
/*  Telling sellers a matching request exists                            */
/*                                                                        */
/*  Before this, nothing told a seller a buyer had posted something they  */
/*  sell — the only way to find out was opening the dashboard and         */
/*  scrolling the open-requests queue yourself. For a request-first       */
/*  marketplace, that is the one part of the loop that had no machinery   */
/*  behind it at all.                                                     */
/* ------------------------------------------------------------------ */

// Who is even a candidate, before sellersToNotifyForNewRequest (pure, in
// requestMatching.ts) decides who among them actually gets told.
//
// A request WITH a category matches sellers who have an ACTIVE listing in
// that category — real selling evidence, not a self-declared label a
// seller may never have updated. Only products with a real seller_id are
// considered: a pre-migration-009 listing with none has no reliably
// identifiable owner, and lib/sellerIdentityMatch.ts's whole principle is
// to refuse rather than guess at that — a notification is exactly the kind
// of thing that must never go to the wrong account.
//
// A request with NO category ("Not sure — leave it to sellers", the
// buyer's own explicit choice on the form) matches every approved seller —
// the buyer said any seller is fair game, so narrowing that ourselves
// would work against what they asked for.
async function candidateSellersForRequest(category: string | null): Promise<RequestNotifyCandidate[]> {
  const db = getDb();

  if (category) {
    // Two flat queries stitched in JS, the same shape as getSellerStatsMap
    // and listPublicProductsForSeller elsewhere in this file, rather than an
    // embedded-resource select — keeps this on the one join style the rest
    // of the codebase (and its test fakes) already understand.
    const productsResult = await db
      .from("products")
      .select("seller_id")
      .eq("category", category)
      .eq("active", true);
    const productRows = assertNoError(productsResult, "finding listings for a new request's category") as Row[];
    const sellerIds = [...new Set(productRows.map((r) => r.seller_id as string | null).filter((id): id is string => id !== null))];
    if (sellerIds.length === 0) return [];

    const sellersResult = await db
      .from("sellers")
      .select("id, user_id, name")
      .in("id", sellerIds)
      .eq("status", "approved");
    const sellerRows = assertNoError(sellersResult, "loading sellers for a new request") as Row[];
    return sellerRows.map((row) => ({
      sellerUserId: row.user_id as string,
      sellerId: row.id as string,
      sellerName: row.name as string,
    }));
  }

  const result = await db.from("sellers").select("user_id, id, name").eq("status", "approved");
  const rows = assertNoError(result, "finding sellers for a new request") as Row[];
  return rows.map((row) => ({
    sellerUserId: row.user_id as string,
    sellerId: row.id as string,
    sellerName: row.name as string,
  }));
}

// Best-effort, exactly like notifyBestEffort itself: a request has already
// been created successfully by the time this runs, so a notification
// failure must never surface as a failure of posting the request.
async function notifySellersOfNewRequest(request: RequestRow): Promise<void> {
  try {
    const candidates = await candidateSellersForRequest(request.category);
    const recipients = sellersToNotifyForNewRequest(candidates, request.userId);
    if (recipients.length === 0) return;

    const budget =
      request.budgetMin != null && request.budgetMax != null
        ? ` Budget: ₦${request.budgetMin.toLocaleString("en-NG")}–₦${request.budgetMax.toLocaleString("en-NG")}.`
        : "";

    await Promise.all(
      recipients.map((r) =>
        notifyBestEffort({
          userId: r.sellerUserId,
          type: "request",
          title: "New request matching what you sell",
          body: `A buyer is looking for "${request.title}".${budget} Open your dashboard to send an offer.`,
        })
      )
    );
  } catch (err) {
    console.error("[notify] failed to notify sellers of new request:", err);
  }
}

const MAX_REQUEST_TITLE_LENGTH = 150;

// Pure — mirrors validateProductInput's shape: the API route already
// requires a non-empty title before calling in, but every other field
// (description/location length, budget sanity, qty) had nothing stopping
// it, the same gap already closed for products.
export function validateRequestInput(input: {
  title?: string;
  description?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  qty?: number;
  location?: string | null;
}): void {
  if (input.title !== undefined && !input.title.trim()) {
    throw new ValidationError("Title is required.");
  }
  if (input.title != null && input.title.length > MAX_REQUEST_TITLE_LENGTH) {
    throw new ValidationError(`Title must be under ${MAX_REQUEST_TITLE_LENGTH} characters.`);
  }
  if (input.description != null && input.description.length > MAX_DESCRIPTION_LENGTH) {
    throw new ValidationError(`Description must be under ${MAX_DESCRIPTION_LENGTH} characters.`);
  }
  if (input.location != null && input.location.length > MAX_LOCATION_LENGTH) {
    throw new ValidationError(`Location must be under ${MAX_LOCATION_LENGTH} characters.`);
  }
  if (input.budgetMin != null && (!Number.isFinite(input.budgetMin) || input.budgetMin < 0)) {
    throw new ValidationError("Minimum budget can't be negative.");
  }
  if (input.budgetMax != null && (!Number.isFinite(input.budgetMax) || input.budgetMax < 0)) {
    throw new ValidationError("Maximum budget can't be negative.");
  }
  if (input.budgetMin != null && input.budgetMax != null && input.budgetMin > input.budgetMax) {
    throw new ValidationError("Minimum budget can't be more than the maximum.");
  }
  if (input.qty !== undefined && (!Number.isInteger(input.qty) || input.qty <= 0)) {
    throw new ValidationError("Quantity must be a positive whole number.");
  }
}

export async function createRequest(input: {
  title: string;
  description: string | null;
  category?: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  qty: number;
  location: string | null;
  lat?: number | null;
  lng?: number | null;
  condition: string;
  userId: string;
}): Promise<RequestRow> {
  validateRequestInput(input);
  if (input.category && !(await isValidCategoryKey(input.category))) {
    throw new ValidationError("Unknown category.");
  }
  const db = getDb();
  const id = randomId("REQ-");
  const result = await db
    .from("requests")
    .insert({
      id,
      user_id: input.userId,
      title: input.title,
      description: input.description,
      category: input.category ?? null,
      budget_min: input.budgetMin,
      budget_max: input.budgetMax,
      qty: input.qty,
      location: input.location,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      condition: input.condition,
      status: "open",
    })
    .select()
    .single();
  const row = assertNoError(result, "creating request") as Row;
  const request = rowToRequest(row, 0);

  // The request already exists by this point — a failure below must never
  // read back as "posting the request failed". See notifySellersOfNewRequest.
  await notifySellersOfNewRequest(request);

  return request;
}

/* ------------------------------------------------------------------ */
/*  User location — set only when a user explicitly grants browser      */
/*  geolocation permission (see components/findit-app/location.js).     */
/*  Never inferred, never defaulted to a hardcoded city.                 */
/* ------------------------------------------------------------------ */

export async function updateUserLocation(userId: string, lat: number, lng: number): Promise<void> {
  const db = getDb();
  const result = await db
    .from("users")
    .update({ lat, lng, location_updated_at: new Date().toISOString() })
    .eq("id", userId);
  assertNoError(result, "updating your location");
}

// A real seller-submitted offer — every field is what the seller entered in
// the form, nothing is auto-generated.
// Pure — the offer-validity rules a seller's submitted form has to satisfy.
export function validateOfferInput(input: { price: number; delivery: string; eta: string; warranty: string }): void {
  if (!Number.isFinite(input.price) || input.price <= 0) {
    throw new ValidationError("Price must be a positive number.");
  }
  if (!input.delivery.trim() || !input.eta.trim() || !input.warranty.trim()) {
    throw new ValidationError("Delivery, ETA, and warranty are required.");
  }
}

export async function addSellerOfferToRequest(
  requestId: string,
  sellerName: string,
  // See sellerId on createProduct — same dual-write, looked up by the caller
  // via getSellerIdForUser.
  sellerId: string | null,
  input: {
    price: number;
    delivery: string;
    eta: string;
    warranty: string;
    note?: string | null;
    deliveryOption?: DeliveryOptions | null;
    deliveryFee?: number;
  }
): Promise<Offer | null> {
  const db = getDb();
  const requestResult = await db.from("requests").select("*").eq("id", requestId).maybeSingle();
  const request = assertNoError(requestResult, "loading request") as Row | null;
  if (!request) return null;

  // A request already 'matched' (the buyer accepted someone else's offer)
  // or 'cancelled' can't take a new offer — the buyer will never see it,
  // since GET /api/requests only ever lists status='open' ones. Without
  // this a seller could still successfully POST here (a stale page, a
  // resubmitted form) with no error explaining why nothing happens.
  if (request.status !== "open") {
    throw new ValidationError("This request isn't open anymore — the buyer already found what they needed.");
  }

  validateOfferInput(input);

  const id = randomId("OFR-");
  const insertResult = await db
    .from("offers")
    .insert({
      id,
      request_id: requestId,
      seller: sellerName,
      seller_id: sellerId,
      price: Math.round(input.price),
      delivery: input.delivery.trim(),
      eta: input.eta.trim(),
      condition: (request.condition as string) || "New",
      warranty: input.warranty.trim(),
      note: input.note?.trim() || null,
      delivery_option: input.deliveryOption ?? null,
      delivery_fee: input.deliveryOption === "Pickup" ? 0 : Math.max(0, Math.round(input.deliveryFee ?? 0)),
    })
    .select()
    .single();
  const row = assertNoError(insertResult, "sending offer") as Row;

  // Let the buyer know a real offer came in — this is the honest replacement
  // for the old fake "3 sellers responded" seed notification.
  await createNotification({
    userId: request.user_id as string,
    type: "offer",
    title: "New offer on your request",
    body: `${sellerName} responded to "${request.title}"`,
  });

  const stats = await getSellerStatsMap();
  return rowToOffer(row, statsFor(stats, sellerName));
}

export async function acceptOffer(
  requestId: string,
  offerId: string,
  userId: string
): Promise<{ order: Order } | null> {
  const db = getDb();
  const offerResult = await db
    .from("offers")
    .select("*")
    .eq("id", offerId)
    .eq("request_id", requestId)
    .maybeSingle();
  const offer = assertNoError(offerResult, "loading offer") as Row | null;
  const requestResult = await db.from("requests").select("*").eq("id", requestId).maybeSingle();
  const request = assertNoError(requestResult, "loading request") as Row | null;
  if (!offer || !request) return null;

  // Ownership check — without this, ANY logged-in user could accept an
  // offer on a request that isn't theirs: mark someone else's request
  // "matched" and create a real order in their own name against another
  // buyer's request. Return the same "not found" shape as a bad id so a
  // caller can't distinguish "doesn't exist" from "not yours".
  if (request.user_id !== userId) return null;

  // Claim the REQUEST first, atomically — this, not the offer row, is the
  // real "only one winner" gate. The offer-level check below stops the
  // SAME offer being accepted twice, but does nothing to stop a buyer
  // accepting two DIFFERENT offers on the same request (a double-tap on
  // two different "Accept" buttons before the list refreshes — the client
  // only disables the one button being tapped, see MyRequests.jsx): two
  // concurrent accepts on different offers would both pass an offer-scoped
  // check, creating two real orders for one request. Only the call that
  // actually flips this request open -> matched proceeds; every other
  // accept attempt on this request, on any offer, fails the same way a
  // not-found request would.
  const requestClaimResult = await db
    .from("requests")
    .update({ status: "matched" })
    .eq("id", requestId)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  const requestClaimed = assertNoError(requestClaimResult, "claiming request") as Row | null;
  if (!requestClaimed) return null;

  // The request claim above is what actually prevents a duplicate order —
  // this offer-level flip is now just bookkeeping (which specific offer
  // won), safe to do unconditionally since only one caller can ever reach
  // this point for this request.
  await assertNoError(
    await db.from("offers").update({ accepted: true }).eq("id", offerId),
    "accepting offer"
  );

  // "Awaiting payment", not "Seller preparing" — accepting an offer doesn't
  // move any money by itself; the buyer still has to actually pay (see
  // lib/payments.ts#initiateOrderPayment) before the seller is told to
  // start preparing anything.
  const order = await insertOrder({
    item: request.title as string,
    seller: offer.seller as string,
    sellerId: (offer.seller_id as string | null) ?? null,
    price: offer.price as number,
    status: "Awaiting payment",
    requestId,
    userId,
    deliveryOptions: (offer.delivery_option as DeliveryOptions | null | undefined) ?? null,
    deliveryFeeQuote: (offer.delivery_fee as number | null | undefined) ?? 0,
  });

  // Before this, a winning seller only ever found out indirectly, later,
  // once the buyer actually paid (notifySellerOfNewOrder) — and a losing
  // seller never found out at all, their offer just silently stopped
  // mattering once the request flipped to 'matched'. Best-effort and after
  // the order already exists, same reasoning as notifySellerOfNewOrder:
  // offer.seller_id is a sellers.id, not a users.id, so it needs the same
  // resolution those other notifications already do.
  const otherOffersResult = await db.from("offers").select("*").eq("request_id", requestId).neq("id", offerId);
  const otherOffers = assertNoError(otherOffersResult, "loading other offers") as Row[];
  const notifyOfferOutcome = async (offerRow: Row, accepted: boolean) => {
    const sId = offerRow.seller_id as string | null;
    const seller = sId ? await findUserForSellerId(sId) : await findUserByBusinessName(offerRow.seller as string);
    if (!seller) return;
    await notifyBestEffort({
      userId: seller.id,
      type: "offer",
      title: accepted ? "Your offer was accepted" : "Offer not selected",
      body: accepted
        ? `The buyer accepted your offer on "${request.title}".`
        : `The buyer went with another offer on "${request.title}".`,
    });
  };
  await notifyOfferOutcome(offer, true);
  await Promise.all(otherOffers.map((o) => notifyOfferOutcome(o, false)));

  return { order };
}

// A buyer's own request had no way to be closed once posted — the status
// column already models 'cancelled' (see migration/schema), nothing ever
// wrote it. Only the owning buyer, and only while still 'open' — a
// 'matched' request already has a real order behind it, and cancelling the
// REQUEST at that point wouldn't touch that order (ORDER_STATUSES has no
// 'Cancelled' state at all yet — a genuinely separate, larger gap, not
// something this function can paper over), so it would just be a confusing
// no-op that looks like it did something it didn't.
export async function cancelRequest(requestId: string, userId: string): Promise<RequestRow | null> {
  const db = getDb();
  const result = await db
    .from("requests")
    .update({ status: "cancelled" })
    .eq("id", requestId)
    .eq("user_id", userId)
    .eq("status", "open")
    .select()
    .maybeSingle();
  const row = assertNoError(result, "cancelling request") as Row | null;
  if (!row) return null;
  const counts = await offerCountsFor([requestId]);
  return rowToRequest(row, counts.get(requestId) ?? 0);
}

/* ------------------------------------------------------------------ */
/*  Saved items (wishlist)                                              */
/* ------------------------------------------------------------------ */

export async function listSavedProductIds(userId: string): Promise<string[]> {
  const db = getDb();
  const result = await db.from("saved_items").select("product_id").eq("user_id", userId);
  const rows = assertNoError(result, "listing saved items") as Row[];
  return rows.map((r) => r.product_id as string);
}

export async function saveItem(userId: string, productId: string): Promise<void> {
  const db = getDb();
  const id = "sv_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const result = await db
    .from("saved_items")
    .upsert({ id, user_id: userId, product_id: productId }, { onConflict: "user_id,product_id" });
  assertNoError(result, "saving item");
}

export async function unsaveItem(userId: string, productId: string): Promise<void> {
  const db = getDb();
  const result = await db
    .from("saved_items")
    .delete()
    .eq("user_id", userId)
    .eq("product_id", productId);
  assertNoError(result, "removing saved item");
}

/* ------------------------------------------------------------------ */
/*  Messaging                                                            */
/* ------------------------------------------------------------------ */

export type PublicUser = {
  id: string;
  name: string;
  role: string;
  businessName: string | null;
  // Their profile photo, so the other person in a chat sees who they're talking to.
  avatarUrl: string | null;
};

export type Conversation = {
  id: string;
  otherParty: PublicUser;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  mine: boolean;
};

function rowToPublicUser(row: Row): PublicUser {
  return {
    id: row.id as string,
    name: row.name as string,
    role: row.role as string,
    businessName: (row.business_name as string | null) ?? null,
    avatarUrl: (row.avatar_url as string | null) ?? null,
  };
}

export async function findUserByBusinessName(name: string): Promise<PublicUser | null> {
  const db = getDb();
  const result = await db
    .from("users")
    .select("*")
    .eq("role", "seller")
    .eq("business_name", name)
    .maybeSingle();
  const row = assertNoError(result, "looking up seller") as Row | null;
  return row ? rowToPublicUser(row) : null;
}

// The unambiguous counterpart to findUserByBusinessName above — business_name
// has no uniqueness constraint (see lib/sellerIdentityMatch.ts), so two
// different sellers can share a name, and a name-only lookup for the
// "message seller" flow would then throw (maybeSingle refuses to guess
// between rows) instead of opening a thread with either one. Every caller
// that already knows the seller's real id (a product's sellerId, a store
// profile's id) should use this instead; the name path stays only as a
// fallback for contexts with no id (pre-seller_id-backfill data).
export async function findUserForSellerId(sellerId: string): Promise<PublicUser | null> {
  const db = getDb();
  const sellerResult = await db.from("sellers").select("user_id").eq("id", sellerId).maybeSingle();
  const sellerRow = assertNoError(sellerResult, "looking up seller") as Row | null;
  if (!sellerRow) return null;
  return getPublicUser(sellerRow.user_id as string);
}

// Exported so a seller-initiated conversation (see
// app/api/orders/[id]/message/route.ts) can look up the buyer's
// display name — never their phone, password, or anything else private.
export async function getPublicUser(id: string): Promise<PublicUser | null> {
  const db = getDb();
  const result = await db.from("users").select("*").eq("id", id).maybeSingle();
  const row = assertNoError(result, "loading user") as Row | null;
  return row ? rowToPublicUser(row) : null;
}

export async function getOrCreateConversation(buyerId: string, sellerId: string): Promise<string> {
  if (buyerId === sellerId) {
    throw new ValidationError("Can't start a conversation with yourself.");
  }
  const db = getDb();
  const existingResult = await db
    .from("conversations")
    .select("id")
    .eq("buyer_id", buyerId)
    .eq("seller_id", sellerId)
    .maybeSingle();
  const existing = assertNoError(existingResult, "looking up conversation") as Row | null;
  if (existing) return existing.id as string;

  const id = "conv_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const insertResult = await db
    .from("conversations")
    .insert({ id, buyer_id: buyerId, seller_id: sellerId });
  if (insertResult.error) {
    // 23505 = unique_violation on (buyer_id, seller_id) — a concurrent
    // request (e.g. a double-tap on "message seller") already created this
    // exact conversation between the read above and this insert. That's a
    // race, not a real failure: use the one that won instead of surfacing
    // an error, and never retry the insert itself (that would risk a
    // second row with a different id colliding on the same unique pair).
    if (insertResult.error.code === "23505") {
      const raceResult = await db
        .from("conversations")
        .select("id")
        .eq("buyer_id", buyerId)
        .eq("seller_id", sellerId)
        .single();
      const race = assertNoError(raceResult, "loading conversation after a race") as Row;
      return race.id as string;
    }
    throw new Error(`creating conversation: ${insertResult.error.message}`);
  }
  return id;
}

export async function getConversation(
  id: string
): Promise<{ buyerId: string; sellerId: string } | null> {
  const db = getDb();
  const result = await db.from("conversations").select("*").eq("id", id).maybeSingle();
  const row = assertNoError(result, "loading conversation") as Row | null;
  if (!row) return null;
  return { buyerId: row.buyer_id as string, sellerId: row.seller_id as string };
}

export async function listConversations(userId: string): Promise<Conversation[]> {
  const db = getDb();
  // ONLY the conversations this user is part of, as buyer or as seller.
  // This query used to have no filter at all, so every account's Messages
  // list showed every conversation on FindIt (the other person's name and
  // the last message), including a brand-new user's. The service-role key
  // bypasses RLS, so this filter is the real privacy boundary. Two plain
  // .eq() queries instead of one .or("buyer_id.eq.…,seller_id.eq.…") string,
  // so a user id can never be read as part of a filter expression.
  if (!userId) return [];
  const [asBuyer, asSeller] = await Promise.all([
    db.from("conversations").select("*").eq("buyer_id", userId),
    db.from("conversations").select("*").eq("seller_id", userId),
  ]);
  const byId = new Map<string, Row>();
  for (const row of [
    ...(assertNoError(asBuyer, "listing conversations") as Row[]),
    ...(assertNoError(asSeller, "listing conversations") as Row[]),
  ]) {
    byId.set(row.id as string, row);
  }
  // Belt and braces: never return a conversation this user isn't in.
  const rows = [...byId.values()].filter((row) => row.buyer_id === userId || row.seller_id === userId);

  const conversations = await Promise.all(
    rows.map(async (row) => {
      const otherId = row.buyer_id === userId ? (row.seller_id as string) : (row.buyer_id as string);
      const other = (await getPublicUser(otherId))!;

      const lastMessageResult = await db
        .from("messages")
        .select("*")
        .eq("conversation_id", row.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const lastMessage = assertNoError(lastMessageResult, "loading last message") as Row | null;

      const unreadResult = await db
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", row.id)
        .neq("sender_id", userId)
        .eq("read", false);
      assertNoError(unreadResult, "counting unread messages");
      const unreadCount = unreadResult.count ?? 0;

      return {
        id: row.id as string,
        otherParty: other,
        lastMessage: (lastMessage?.body as string) ?? null,
        lastMessageAt: (lastMessage?.created_at as string) ?? (row.created_at as string),
        unreadCount,
      };
    })
  );
  // The real order: most recent activity first, same as every other
  // messaging UI. Sorted here (not via the DB query above) because
  // lastMessageAt itself is only known after each conversation's own
  // latest-message lookup above resolves.
  return conversations.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
}

export async function listMessages(conversationId: string, viewerId: string): Promise<Message[]> {
  const db = getDb();
  const result = await db
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  const rows = assertNoError(result, "listing messages") as Row[];

  const updateResult = await db
    .from("messages")
    .update({ read: true })
    .eq("conversation_id", conversationId)
    .neq("sender_id", viewerId)
    .eq("read", false);
  assertNoError(updateResult, "marking messages read");

  return rows.map((row) => ({
    id: row.id as string,
    conversationId: row.conversation_id as string,
    senderId: row.sender_id as string,
    body: row.body as string,
    createdAt: row.created_at as string,
    mine: row.sender_id === viewerId,
  }));
}

const MAX_MESSAGE_LENGTH = 2000;

export async function sendMessage(
  conversationId: string,
  senderId: string,
  body: string
): Promise<Message> {
  if (!body.trim()) {
    throw new ValidationError("Message can't be empty.");
  }
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError(`Message must be under ${MAX_MESSAGE_LENGTH} characters.`);
  }
  const db = getDb();
  const id = "msg_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const result = await db
    .from("messages")
    .insert({ id, conversation_id: conversationId, sender_id: senderId, body: body.trim() })
    .select()
    .single();
  const row = assertNoError(result, "sending message") as Row;

  // The in-thread 4s poll (see Thread.jsx) only ever reaches someone who
  // already has this exact conversation open — the recipient's only other
  // signal was the notification bell, which never fired for a message at
  // all. buyer_id/seller_id on `conversations` are real users.id values
  // already (see getOrCreateConversation), not a seller business-id that
  // needs resolving like order.sellerId does elsewhere in this file.
  const conversation = await getConversation(conversationId);
  if (conversation) {
    const recipientId = conversation.buyerId === senderId ? conversation.sellerId : conversation.buyerId;
    const sender = await getPublicUser(senderId);
    const senderName = sender?.businessName || sender?.name || "Someone";
    await notifyBestEffort({
      userId: recipientId,
      type: "message",
      title: `New message from ${senderName}`,
      body: body.trim().length > 120 ? `${body.trim().slice(0, 117)}...` : body.trim(),
    });
  }

  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    senderId: row.sender_id as string,
    body: row.body as string,
    createdAt: row.created_at as string,
    mine: true,
  };
}
