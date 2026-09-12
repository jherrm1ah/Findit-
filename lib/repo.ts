import { getDb, assertNoError } from "./db";
import { CATEGORY_LABELS } from "./categories";
import { assertCanActivateProduct, assertCanCustomizeStore, getStorePlanDisplayMap } from "./subscriptions";
import { computeVerificationLevel, VerificationLevel, VerificationStatus } from "./sellerVerificationLevels";

export const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS);

// Thrown for real, user-facing validation problems (bad input, business-rule
// violations) — safe to show verbatim to the client. Anything else that
// escapes a repo function (a Postgres/network error via assertNoError, etc.)
// is NOT a ValidationError and must never be shown to the client as-is; see
// lib/errors.ts#toClientError, used by every API route's catch block.
export class ValidationError extends Error {}

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
};

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
    .select("id, name, status, logo_url, banner_url, verification_status, public_state, public_city, public_area, created_at");
  const sellerRows = assertNoError(sellersResult, "loading sellers") as Row[];

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
      logoUrl: (row.logo_url as string | null) ?? null,
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

function rowToProduct(row: Row, stats: SellerStats): Product {
  return {
    id: row.id as string,
    category: row.category as string,
    name: row.name as string,
    price: row.price as number,
    seller: row.seller as string,
    sellerId: (row.seller_id as string | null) ?? null,
    imageUrl: (row.image_url as string | null) ?? null,
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
  };
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

export async function listProducts(): Promise<Product[]> {
  const db = getDb();
  const result = await db.from("products").select("*").order("created_at", { ascending: false });
  const rows = assertNoError(result, "listing products") as Row[];
  const stats = await getSellerStatsMap();
  return sortFeaturedFirst(rows.map((row) => rowToProduct(row, statsFor(stats, row.seller as string))));
}

export async function getProduct(id: string): Promise<Product | null> {
  const db = getDb();
  const result = await db.from("products").select("*").eq("id", id).maybeSingle();
  const row = assertNoError(result, "loading product") as Row | null;
  if (!row) return null;
  const stats = await getSellerStatsMap();
  return rowToProduct(row, statsFor(stats, row.seller as string));
}

let productSeq = 0;

// Pure — the actual listing-validity rules, unit-testable without a
// database. category/name are only checked when provided, so this also
// covers a partial update patch.
export function validateProductInput(input: {
  category?: string;
  name?: string;
  price?: number;
}): void {
  if (input.category !== undefined && !CATEGORY_KEYS.includes(input.category)) {
    throw new ValidationError("Unknown category.");
  }
  if (input.name !== undefined && !input.name.trim()) {
    throw new ValidationError("Name is required.");
  }
  if (input.price !== undefined && (!Number.isFinite(input.price) || input.price <= 0)) {
    throw new ValidationError("Price must be a positive number.");
  }
}

// Restricts a product's imageUrl to our own Supabase Storage bucket — a
// listing must not be able to point at an arbitrary external URL (used as a
// tracking pixel against every viewer, or content we don't control at all).
// Pure given the prefix, so it's unit-testable without env vars.
export function isValidProductImageUrl(url: string, storagePrefix: string): boolean {
  return url.startsWith(storagePrefix);
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
  imageUrl?: string | null;
  lat?: number | null;
  lng?: number | null;
}): Promise<Product> {
  validateProductInput(input);

  // Backend-enforced, not a frontend nicety: a Free seller at their listing
  // cap can't bypass the "Add listing" button by hitting this API directly.
  // Only checked when the caller's seller_id is known — an account whose
  // seller_id hasn't been backfilled yet (pre-migration-009 data) can't have
  // its plan looked up reliably, so it falls back to today's behavior
  // (no limit) rather than blocking a real seller over a migration gap.
  if (input.sellerId) {
    await assertCanActivateProduct(input.sellerId);
  }

  const db = getDb();
  const id = "p_" + Date.now().toString(36) + (productSeq++).toString(36);
  const result = await db
    .from("products")
    .insert({
      id,
      category: input.category,
      name: input.name.trim(),
      price: Math.round(input.price),
      seller: input.seller,
      seller_id: input.sellerId ?? null,
      image_url: input.imageUrl ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      art: Math.floor(Math.random() * 5),
    })
    .select()
    .single();
  assertNoError(result, "creating product");
  return getProduct(id) as Promise<Product>;
}

export async function updateProduct(
  id: string,
  patch: Partial<{
    name: string;
    category: string;
    price: number;
    imageUrl: string | null;
    lat: number | null;
    lng: number | null;
    // Reactivating a listing a plan downgrade hid goes through the same
    // limit check createProduct does — a seller can't work around their
    // plan's cap by flipping an existing listing back on instead of making
    // a new one.
    active: boolean;
  }>
): Promise<Product | null> {
  const existing = await getProduct(id);
  if (!existing) return null;

  validateProductInput(patch);

  // Same fallback-skip as createProduct: only enforced when this listing's
  // seller_id is known.
  if (patch.active === true && !existing.active && existing.sellerId) {
    await assertCanActivateProduct(existing.sellerId);
  }

  const db = getDb();
  const result = await db
    .from("products")
    .update({
      name: (patch.name ?? existing.name).trim(),
      category: patch.category ?? existing.category,
      price: Math.round(patch.price ?? existing.price),
      image_url: patch.imageUrl !== undefined ? patch.imageUrl : existing.imageUrl,
      lat: patch.lat !== undefined ? patch.lat : existing.lat,
      lng: patch.lng !== undefined ? patch.lng : existing.lng,
      active: patch.active !== undefined ? patch.active : existing.active,
    })
    .eq("id", id);
  assertNoError(result, "updating product");
  return getProduct(id);
}

export async function deleteProduct(id: string): Promise<boolean> {
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
    escrowStatus: ((row.escrow_status as EscrowStatus | null) ?? "unpaid"),
    issueReportedAt: (row.issue_reported_at as string | null) ?? null,
    issueNote: (row.issue_note as string | null) ?? null,
    paymentStatus: ((row.payment_status as PaymentStatus | null) ?? "pending"),
    paidAt: (row.paid_at as string | null) ?? null,
    platformFeeBps: (row.platform_fee_bps as number | null) ?? null,
    platformFeeAmount: (row.platform_fee_amount as number | null) ?? null,
    sellerPayoutAmount: (row.seller_payout_amount as number | null) ?? null,
  };
}

export const ORDER_STATUSES = [
  "Awaiting payment",
  "Seller preparing",
  "Dispatched",
  "Out for delivery",
  "Delivered",
] as const;

// A buyer's own orders, plus (when sellerName is given) orders placed
// against that seller's business name so they have something to fulfill.
// There is no more "shared guest content" — every order belongs to a real
// logged-in buyer (see the "guest checkout" note in app/api/orders/route.ts).
export async function listOrders(userId: string, sellerName?: string | null): Promise<Order[]> {
  const db = getDb();
  if (!sellerName) {
    const result = await db.from("orders").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    const rows = assertNoError(result, "listing orders") as Row[];
    return rows.map(rowToOrder);
  }

  // Two separate .eq() queries merged in JS, not a single .or(...) filter —
  // sellerName is a seller's own business name, which they set to whatever
  // text they want (see updateSellerBusinessName, which has no character
  // restriction). Interpolating it into a raw PostgREST filter STRING would
  // let a crafted name (containing a comma) inject an extra OR condition
  // and read a completely different seller's order history. .eq() takes
  // its value as a real parameter, not a string the caller has to escape,
  // so it can't be broken out of this way.
  const [ownResult, sellerResult] = await Promise.all([
    db.from("orders").select("*").eq("user_id", userId),
    db.from("orders").select("*").eq("seller", sellerName),
  ]);
  const ownRows = assertNoError(ownResult, "listing orders") as Row[];
  const sellerRows = assertNoError(sellerResult, "listing seller orders") as Row[];
  const byId = new Map<string, Row>();
  for (const row of [...ownRows, ...sellerRows]) byId.set(row.id as string, row);
  return [...byId.values()]
    .map(rowToOrder)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
      status: input.status,
      request_id: input.requestId ?? null,
    })
    .select()
    .single();
  const row = assertNoError(result, "creating order") as Row;
  return rowToOrder(row);
}

const MAX_ORDER_QTY = 999;

// The "Buy now" path. price/seller/item are NEVER taken from the client —
// only productId and qty are, and the real price/seller come from the
// product row itself, exactly as validateProductInput already guarantees
// (positive price, real seller). This closes what used to be a direct
// price/seller tampering hole (the client previously supplied all three).
export async function createOrderFromProduct(
  productId: string,
  qty: number,
  userId: string
): Promise<Order> {
  if (!Number.isFinite(qty) || qty < 1 || qty > MAX_ORDER_QTY) {
    throw new ValidationError(`Quantity must be between 1 and ${MAX_ORDER_QTY}.`);
  }
  const product = await getProduct(productId);
  if (!product) {
    throw new ValidationError("That product is no longer available.");
  }
  const order = await insertOrder({
    item: product.name,
    seller: product.seller,
    sellerId: product.sellerId,
    price: product.price * qty,
    status: "Awaiting payment",
    userId,
  });

  // No seller notification here — the seller learns about this order once
  // it's actually paid for (see lib/payments.ts#confirmOrderPayment), not
  // the moment a buyer starts checkout on something they might never pay.
  return order;
}

// Shared by both ways an order gets created (direct purchase and accepting
// a request offer) — looks the seller's account up by business name so the
// notification lands on the right user, not just a string on the order row.
// Called only once a payment is actually confirmed (lib/payments.ts), never
// at order creation.
export async function notifySellerOfNewOrder(sellerBusinessName: string, order: Order): Promise<void> {
  const seller = await findUserByBusinessName(sellerBusinessName);
  if (!seller) return; // seller hasn't joined FindIt as an account directly — nothing to notify
  await notifyBestEffort({
    userId: seller.id,
    type: "payment",
    title: "New order",
    body: `"${order.item}" was just ordered — ₦${order.price.toLocaleString("en-NG")} is held by FindIt until delivery is confirmed.`,
  });
}

export async function submitOrderReview(
  id: string,
  userId: string,
  review: { rating: number; comment: string | null }
): Promise<Order | null> {
  const existing = await getOrder(id);
  if (!existing || existing.userId !== userId) return null;
  if (!existing.canReview) {
    throw new ValidationError("You can review this order once you confirm it arrived.");
  }

  const db = getDb();
  const result = await db
    .from("orders")
    .update({ reviewed: true, my_rating: review.rating, review_comment: review.comment })
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .maybeSingle();
  const row = assertNoError(result, "submitting review") as Row | null;
  if (!row) return null;
  const order = rowToOrder(row);

  const seller = await findUserByBusinessName(order.seller);
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

export async function updateOrderStatus(id: string, status: string): Promise<Order | null> {
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
  const result = await db
    .from("orders")
    .update({ status })
    .eq("id", id)
    .select()
    .single();
  const row = assertNoError(result, "updating order status") as Row;
  const order = rowToOrder(row);

  // Let the buyer know their order moved forward — best-effort: a
  // notification failure shouldn't undo or block the status update itself.
  const copy = STATUS_NOTIFICATION_COPY[status];
  if (copy) {
    await notifyBestEffort({
      userId: order.userId,
      type: "delivery",
      title: copy.title,
      body: copy.body(order.item),
    });
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

  const now = new Date().toISOString();
  const db = getDb();
  // Conditional on buyer_confirmed_at still being null, so two taps in quick
  // succession can't both release the same order's funds.
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
    .is("buyer_confirmed_at", null)
    .select()
    .maybeSingle();
  const row = assertNoError(result, "confirming delivery") as Row | null;
  if (!row) throw new ValidationError("You've already confirmed this order.");
  const order = rowToOrder(row);

  const seller = await findUserByBusinessName(order.seller);
  if (seller) {
    await notifyBestEffort({
      userId: seller.id,
      type: "delivery",
      title: "Delivery confirmed",
      body: `The buyer confirmed they received "${order.item}". Your payment has been released.`,
    });
  }

  return order;
}

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
    throw new ValidationError("You've already confirmed this order as delivered — message the seller or contact support.");
  }
  if (existing.escrowStatus === "refunded") {
    throw new ValidationError("This order has already been refunded.");
  }
  if (existing.issueReportedAt) {
    throw new ValidationError("You've already reported a problem with this order — we're looking into it.");
  }

  const db = getDb();
  const result = await db
    .from("orders")
    .update({
      escrow_status: "disputed",
      issue_reported_at: new Date().toISOString(),
      issue_note: trimmed,
    })
    .eq("id", id)
    .eq("user_id", userId)
    .is("issue_reported_at", null)
    .select()
    .maybeSingle();
  const row = assertNoError(result, "reporting an order problem") as Row | null;
  if (!row) throw new ValidationError("You've already reported a problem with this order.");
  const order = rowToOrder(row);

  const seller = await findUserByBusinessName(order.seller);
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

  await notifyBestEffort({
    userId: order.userId,
    type: "delivery",
    title: outcome === "refunded" ? "Your refund was approved" : "Your reported problem was reviewed",
    body:
      outcome === "refunded"
        ? `FindIt reviewed your report on "${order.item}" and approved a refund.`
        : `FindIt reviewed your report on "${order.item}" and released the payment to the seller.`,
  });

  const seller = await findUserByBusinessName(order.seller);
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
    await createNotification(input);
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
    createdAt: row.created_at as string,
  };
}

export async function listSellers(): Promise<Seller[]> {
  const db = getDb();
  const result = await db
    .from("sellers")
    .select("*, users(phone)")
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
): Promise<{ logoUrl: string | null; bannerUrl: string | null } | null> {
  const db = getDb();
  const result = await db.from("sellers").select("logo_url, banner_url").eq("user_id", userId).maybeSingle();
  const row = assertNoError(result, "loading store branding") as Row | null;
  if (!row) return null;
  return { logoUrl: (row.logo_url as string | null) ?? null, bannerUrl: (row.banner_url as string | null) ?? null };
}

export async function getSellerIdForUser(userId: string): Promise<string | null> {
  const db = getDb();
  const result = await db.from("sellers").select("id").eq("user_id", userId).maybeSingle();
  const row = assertNoError(result, "looking up seller id") as Row | null;
  return (row?.id as string | undefined) ?? null;
}

// Real backing for the "customization" Store subscription benefit — gated
// server-side (assertCanCustomizeStore) so a Free/Basic seller can't set
// these just by knowing the endpoint exists. logoUrl/bannerUrl null clears
// that image; undefined leaves it untouched.
export async function updateSellerBranding(
  sellerId: string,
  patch: { logoUrl?: string | null; bannerUrl?: string | null }
): Promise<void> {
  await assertCanCustomizeStore(sellerId);

  const columns: Record<string, unknown> = {};
  if (patch.logoUrl !== undefined) columns.logo_url = patch.logoUrl;
  if (patch.bannerUrl !== undefined) columns.banner_url = patch.bannerUrl;
  if (Object.keys(columns).length === 0) return;

  const db = getDb();
  const result = await db.from("sellers").update(columns).eq("id", sellerId);
  assertNoError(result, "updating store branding");
}

export async function setSellerStatus(id: string, status: SellerStatus, reason: string | null = null): Promise<Seller | null> {
  if ((status === "rejected" || status === "suspended") && !reason?.trim()) {
    throw new ValidationError("Give the seller a reason — never a silent rejection or suspension.");
  }
  const db = getDb();
  const result = await db
    .from("sellers")
    .update({ status, status_reason: status === "approved" || status === "pending" ? null : reason!.trim() })
    .eq("id", id)
    .select("*, users(phone)")
    .maybeSingle();
  const row = assertNoError(result, "updating seller status") as Row | null;
  if (!row) return null;
  const seller = rowToSeller(row);

  const NOTIFY: Record<SellerStatus, { title: string; body: string } | null> = {
    pending: null,
    approved: {
      title: "You're approved to sell",
      body: "Your seller account has been approved — you can now list products and respond to requests.",
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

function rowToRequest(row: Row, offerCount: number, customerName?: string | null): RequestRow {
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

export async function listOpenRequests(): Promise<RequestRow[]> {
  const db = getDb();
  const result = await db
    .from("requests")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  const rows = assertNoError(result, "listing open requests") as Row[];
  const counts = await offerCountsFor(rows.map((r) => r.id as string));
  const names = await customerNamesFor(rows.map((r) => r.user_id as string));
  return rows.map((row) =>
    rowToRequest(row, counts.get(row.id as string) ?? 0, names.get(row.user_id as string))
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
  if (input.category && !CATEGORY_KEYS.includes(input.category)) {
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
  return rowToRequest(row, 0);
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
  input: { price: number; delivery: string; eta: string; warranty: string; note?: string | null }
): Promise<Offer | null> {
  const db = getDb();
  const requestResult = await db.from("requests").select("*").eq("id", requestId).maybeSingle();
  const request = assertNoError(requestResult, "loading request") as Row | null;
  if (!request) return null;

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

  // Conditional on accepted still being false — without this, accepting the
  // same offer twice (a double-tap, a back-button-then-resubmit, or two
  // near-simultaneous requests) creates a second real order from one offer,
  // since nothing else here checks whether it was already accepted. Only
  // the call that actually flips accepted false -> true proceeds; a second
  // one gets treated the same as "not found" rather than creating a
  // duplicate order.
  const claimResult = await db
    .from("offers")
    .update({ accepted: true })
    .eq("id", offerId)
    .eq("accepted", false)
    .select("id")
    .maybeSingle();
  const claimed = assertNoError(claimResult, "accepting offer") as Row | null;
  if (!claimed) return null;

  await assertNoError(
    await db.from("requests").update({ status: "matched" }).eq("id", requestId),
    "updating request status"
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
  });

  return { order };
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
  const result = await db
    .from("conversations")
    .select("*")
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order("created_at", { ascending: false });
  const rows = assertNoError(result, "listing conversations") as Row[];

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
  return conversations;
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

export async function sendMessage(
  conversationId: string,
  senderId: string,
  body: string
): Promise<Message> {
  if (!body.trim()) {
    throw new ValidationError("Message can't be empty.");
  }
  const db = getDb();
  const id = "msg_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const result = await db
    .from("messages")
    .insert({ id, conversation_id: conversationId, sender_id: senderId, body: body.trim() })
    .select()
    .single();
  const row = assertNoError(result, "sending message") as Row;
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    senderId: row.sender_id as string,
    body: row.body as string,
    createdAt: row.created_at as string,
    mine: true,
  };
}
