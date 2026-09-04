import { getDb, assertNoError } from "./db";
import { CATEGORY_LABELS } from "./categories";

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
};

export type Order = {
  id: string;
  userId: string;
  item: string;
  seller: string;
  price: number;
  status: string;
  canReview: boolean;
  reviewed: boolean;
  myRating: number | null;
  reviewComment: string | null;
  requestId: string | null;
  createdAt: string;
};

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  unread: boolean;
  time: string;
};

export type Seller = {
  id: string;
  userId: string;
  name: string;
  phone: string | null;
  status: "pending" | "approved" | "rejected";
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

type SellerStats = { verified: boolean; rating: number | null; orderCount: number };

// Pure — takes already-fetched rows and computes the stats map. Split out
// from getSellerStatsMap() so this (the actual business logic: how a
// seller's rating and verified badge are derived) can be unit-tested without
// a database, the same way it would be tested if it read from a real
// Supabase project.
export function computeSellerStatsMap(
  sellerRows: Array<{ name: string; status: string }>,
  reviewedOrderRows: Array<{ seller: string; my_rating: number | null }>
): Map<string, SellerStats> {
  const map = new Map<string, SellerStats>();

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

async function getSellerStatsMap(): Promise<Map<string, SellerStats>> {
  const db = getDb();

  const sellersResult = await db.from("sellers").select("name, status");
  const sellerRows = assertNoError(sellersResult, "loading sellers") as Row[];

  const ordersResult = await db
    .from("orders")
    .select("seller, my_rating, reviewed")
    .eq("reviewed", true);
  const orderRows = assertNoError(ordersResult, "loading order reviews") as Row[];

  return computeSellerStatsMap(
    sellerRows.map((r) => ({ name: r.name as string, status: r.status as string })),
    orderRows.map((r) => ({ seller: r.seller as string, my_rating: r.my_rating as number | null }))
  );
}

function statsFor(map: Map<string, SellerStats>, seller: string): SellerStats {
  return map.get(seller) ?? { verified: false, rating: null, orderCount: 0 };
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
    imageUrl: (row.image_url as string | null) ?? null,
    art: row.art as number,
    createdAt: row.created_at as string,
    lat: (row.lat as number | null) ?? null,
    lng: (row.lng as number | null) ?? null,
    verified: stats.verified,
    rating: stats.rating,
  };
}

export async function listProducts(): Promise<Product[]> {
  const db = getDb();
  const result = await db.from("products").select("*").order("created_at", { ascending: false });
  const rows = assertNoError(result, "listing products") as Row[];
  const stats = await getSellerStatsMap();
  return rows.map((row) => rowToProduct(row, statsFor(stats, row.seller as string)));
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
  imageUrl?: string | null;
  lat?: number | null;
  lng?: number | null;
}): Promise<Product> {
  validateProductInput(input);

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
  }>
): Promise<Product | null> {
  const existing = await getProduct(id);
  if (!existing) return null;

  validateProductInput(patch);

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
    price: row.price as number,
    status: row.status as string,
    canReview: Boolean(row.can_review),
    reviewed: Boolean(row.reviewed),
    myRating: (row.my_rating as number | null) ?? null,
    reviewComment: (row.review_comment as string | null) ?? null,
    requestId: (row.request_id as string | null) ?? null,
    createdAt: row.created_at as string,
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
  let query = db.from("orders").select("*");
  if (sellerName) {
    query = query.or(`user_id.eq.${userId},seller.eq.${sellerName}`);
  } else {
    query = query.eq("user_id", userId);
  }
  const result = await query.order("created_at", { ascending: false });
  const rows = assertNoError(result, "listing orders") as Row[];
  return rows.map(rowToOrder);
}

// Internal — every field here must already be trusted (derived from a real
// product/offer row on the server), never taken directly from client input.
// createOrderFromProduct and acceptOffer are the only two ways an order gets
// created; both compute item/seller/price themselves before calling this.
async function insertOrder(input: {
  item: string;
  seller: string;
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
  return insertOrder({
    item: product.name,
    seller: product.seller,
    price: product.price * qty,
    status: "Awaiting payment",
    userId,
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
    throw new ValidationError("This order can't be reviewed until it's delivered.");
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
  return row ? rowToOrder(row) : null;
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

export async function updateOrderStatus(id: string, status: string): Promise<Order | null> {
  validateStatusTransition("", status); // checks `status` is a known one; "" skips the forward-only check
  const existing = await getOrder(id);
  if (!existing) return null;
  validateStatusTransition(existing.status, status);

  const db = getDb();
  const result = await db
    .from("orders")
    .update({ status, can_review: status === "Delivered" ? true : existing.canReview })
    .eq("id", id)
    .select()
    .single();
  const row = assertNoError(result, "updating order status") as Row;
  return rowToOrder(row);
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
    status: row.status as Seller["status"],
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

// Used to block a rejected seller from taking further marketplace actions
// (new listings, uploads, offers) — otherwise an admin's "reject" click has
// no real effect, since role alone (checked everywhere else) doesn't change
// when a seller is rejected. Returns null for a non-seller (e.g. an admin),
// which correctly never matches the 'rejected' check callers do.
export async function getSellerStatusForUser(userId: string): Promise<Seller["status"] | null> {
  const db = getDb();
  const result = await db.from("sellers").select("status").eq("user_id", userId).maybeSingle();
  const row = assertNoError(result, "checking seller status") as Row | null;
  return (row?.status as Seller["status"] | undefined) ?? null;
}

export async function setSellerStatus(id: string, status: Seller["status"]): Promise<Seller | null> {
  const db = getDb();
  const result = await db
    .from("sellers")
    .update({ status })
    .eq("id", id)
    .select("*, users(phone)")
    .maybeSingle();
  const row = assertNoError(result, "updating seller status") as Row | null;
  return row ? rowToSeller(row) : null;
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

  await assertNoError(
    await db.from("offers").update({ accepted: true }).eq("id", offerId),
    "accepting offer"
  );
  await assertNoError(
    await db.from("requests").update({ status: "matched" }).eq("id", requestId),
    "updating request status"
  );

  const order = await insertOrder({
    item: request.title as string,
    seller: offer.seller as string,
    price: offer.price as number,
    status: "Seller preparing",
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

async function getPublicUser(id: string): Promise<PublicUser | null> {
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
  assertNoError(insertResult, "creating conversation");
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
