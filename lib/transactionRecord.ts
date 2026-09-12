import crypto from "crypto";
import { getDb, assertNoError } from "./db";
import { computeVerificationLevel, type VerificationLevel, type VerificationStatus } from "./sellerVerificationLevels";
import type { Order } from "./repo";

/* -------------------------------------------------------------------------- */
/*  The public identifier                                                      */
/* -------------------------------------------------------------------------- */

// Crockford-style: no I, L, O or U, so a code read off a screen or a QR label
// can't be mistyped into a different valid code, and no word is spelled by
// accident.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 8;
export const CODE_PREFIX = "FI-";

// ~1.1e12 possibilities. Combined with rate limiting on the verification
// lookup, guessing one is not a practical attack, and the code carries no
// information about how many transactions exist.
export function generateTransactionCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${CODE_PREFIX}${out}`;
}

// Accepts what a person would actually type or paste: lowercase, missing
// prefix, surrounding whitespace. Returns null for anything that isn't a
// well-formed code, so a crafted path segment never reaches a query.
export function normalizeTransactionCode(input: string): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input.trim().toUpperCase().replace(/^FI[-\s]?/, "");
  if (cleaned.length !== CODE_LENGTH) return null;
  for (const char of cleaned) {
    if (!ALPHABET.includes(char)) return null;
  }
  return `${CODE_PREFIX}${cleaned}`;
}

/* -------------------------------------------------------------------------- */
/*  Creation                                                                   */
/* -------------------------------------------------------------------------- */

type Row = Record<string, unknown>;
const UNIQUE_VIOLATION = "23505";

export type TransactionRecord = {
  id: string;
  code: string;
  orderId: string;
  buyerUserId: string;
  sellerId: string | null;
  sellerName: string;
  itemName: string;
  productId: string | null;
  amount: number;
  currency: string;
  sellerVerificationLevel: VerificationLevel;
  paidAt: string | null;
  completedAt: string;
  status: "completed" | "disputed" | "refunded";
  recordScope: "listing" | "item";
  createdAt: string;
};

function rowToRecord(row: Row): TransactionRecord {
  return {
    id: row.id as string,
    code: row.code as string,
    orderId: row.order_id as string,
    buyerUserId: row.buyer_user_id as string,
    sellerId: (row.seller_id as string | null) ?? null,
    sellerName: row.seller_name as string,
    itemName: row.item_name as string,
    productId: (row.product_id as string | null) ?? null,
    amount: row.amount as number,
    currency: (row.currency as string) ?? "NGN",
    sellerVerificationLevel: (row.seller_verification_level as VerificationLevel) ?? "new",
    paidAt: (row.paid_at as string | null) ?? null,
    completedAt: row.completed_at as string,
    status: (row.status as TransactionRecord["status"]) ?? "completed",
    recordScope: (row.record_scope as TransactionRecord["recordScope"]) ?? "listing",
    createdAt: row.created_at as string,
  };
}

function randomId(prefix: string): string {
  return `${prefix}${crypto.randomBytes(9).toString("hex")}`;
}

async function appendEvent(input: {
  recordId: string;
  eventType: "completed" | "dispute_opened" | "dispute_resolved" | "refunded" | "admin_correction";
  actorType: "system" | "buyer" | "seller" | "admin";
  actorId?: string | null;
  reason?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
}): Promise<void> {
  const result = await getDb().from("transaction_record_events").insert({
    id: randomId("tre_"),
    transaction_record_id: input.recordId,
    event_type: input.eventType,
    actor_type: input.actorType,
    actor_id: input.actorId ?? null,
    reason: input.reason ?? null,
    previous_value: input.previousValue ?? null,
    new_value: input.newValue ?? null,
  });
  if (result.error) {
    // The history is the point of this feature, so a failure to write it is
    // worth shouting about — but it must not undo a completion the buyer
    // already saw succeed.
    console.error("[transaction-record] failed to append event:", result.error.message);
  }
}

// The seller's trust level as it stood at completion, computed the same way
// the public badge is (computeVerificationLevel), so the record and the badge
// can never disagree about the same moment.
async function sellerVerificationLevelAt(order: Order): Promise<VerificationLevel> {
  const db = getDb();
  const sellerResult = order.sellerId
    ? await db.from("sellers").select("verification_status").eq("id", order.sellerId).maybeSingle()
    : await db.from("sellers").select("verification_status").eq("name", order.seller).maybeSingle();
  const seller = assertNoError(sellerResult, "loading seller for transaction record") as Row | null;
  if (!seller) return "new";

  const outcomeResult = await db
    .from("orders")
    .select("escrow_status")
    .eq("seller", order.seller)
    .in("escrow_status", ["released", "disputed"]);
  const outcomes = assertNoError(outcomeResult, "loading seller outcomes") as Row[];

  const reviewedResult = await db
    .from("orders")
    .select("my_rating")
    .eq("seller", order.seller)
    .eq("reviewed", true);
  const reviewed = assertNoError(reviewedResult, "loading seller ratings") as Row[];
  const ratings = reviewed.map((r) => r.my_rating as number | null).filter((r): r is number => typeof r === "number");

  return computeVerificationLevel({
    verificationStatus: seller.verification_status as VerificationStatus,
    orderCount: outcomes.filter((r) => r.escrow_status === "released").length,
    disputeCount: outcomes.filter((r) => r.escrow_status === "disputed").length,
    avgRating: ratings.length ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)) : null,
  });
}

// Called at the single moment an order becomes genuinely complete. Safe to
// call more than once: the unique constraint on order_id means a retry, a
// redelivered webhook or two concurrent confirmations all end up returning
// the one record that exists rather than creating a second.
//
// Never throws into the caller's path. A completion the buyer has already
// been told succeeded must not be undone because a record could not be
// written; the failure is logged instead.
export async function recordCompletedTransaction(order: Order): Promise<TransactionRecord | null> {
  try {
    // Refuses to invent a verified record for anything that isn't actually
    // complete, even if a future caller gets this wrong.
    if (order.escrowStatus !== "released" || order.paymentStatus !== "paid") return null;

    const db = getDb();
    const existingResult = await db
      .from("transaction_records")
      .select("*")
      .eq("order_id", order.id)
      .maybeSingle();
    const existing = assertNoError(existingResult, "checking transaction record") as Row | null;
    if (existing) return rowToRecord(existing);

    const level = await sellerVerificationLevelAt(order);
    const completedAt = order.buyerConfirmedAt ?? new Date().toISOString();

    // A code collision is astronomically unlikely but the unique index would
    // reject it, so a couple of attempts costs nothing and removes the case
    // entirely.
    for (let attempt = 0; attempt < 3; attempt++) {
      const id = randomId("txr_");
      const result = await db
        .from("transaction_records")
        .insert({
          id,
          code: generateTransactionCode(),
          order_id: order.id,
          buyer_user_id: order.userId,
          seller_id: order.sellerId,
          seller_name: order.seller,
          item_name: order.item,
          amount: order.price,
          currency: "NGN",
          seller_verification_level: level,
          paid_at: order.paidAt,
          completed_at: completedAt,
          status: "completed",
        })
        .select()
        .maybeSingle();

      if (!result.error) {
        const row = result.data as Row | null;
        if (!row) break;
        const record = rowToRecord(row);
        await appendEvent({
          recordId: record.id,
          eventType: "completed",
          actorType: "system",
          newValue: { status: "completed", orderId: order.id },
        });
        return record;
      }

      if (result.error.code !== UNIQUE_VIOLATION) throw new Error(result.error.message);

      // Either the code collided (retry gets a new one) or another request
      // created this order's record first (re-read and return theirs).
      const raceResult = await db.from("transaction_records").select("*").eq("order_id", order.id).maybeSingle();
      const raced = assertNoError(raceResult, "re-reading transaction record") as Row | null;
      if (raced) return rowToRecord(raced);
    }

    return null;
  } catch (err) {
    console.error("[transaction-record] failed to create:", err);
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Later events — the record is added to, never rewritten                     */
/* -------------------------------------------------------------------------- */

async function transitionStatus(
  orderId: string,
  nextStatus: TransactionRecord["status"],
  event: {
    eventType: "dispute_opened" | "dispute_resolved" | "refunded" | "admin_correction";
    actorType: "system" | "buyer" | "seller" | "admin";
    actorId?: string | null;
    reason?: string | null;
    // Record the event even when the status is unchanged. A dispute resolved
    // in the seller's favour leaves the record 'completed', but the history
    // must still show that it was disputed and settled.
    allowSameStatus?: boolean;
  }
): Promise<void> {
  try {
    const db = getDb();
    const existingResult = await db
      .from("transaction_records")
      .select("id, status")
      .eq("order_id", orderId)
      .maybeSingle();
    const existing = assertNoError(existingResult, "loading transaction record") as Row | null;
    // No record means the order never completed, so there is nothing to
    // annotate. That is the correct outcome, not an error.
    if (!existing) return;

    const previous = existing.status as string;
    if (previous === nextStatus && !event.allowSameStatus) return;

    if (previous !== nextStatus) {
      const update = await db
        .from("transaction_records")
        .update({ status: nextStatus })
        .eq("id", existing.id as string);
      if (update.error) throw new Error(update.error.message);
    }

    await appendEvent({
      recordId: existing.id as string,
      eventType: event.eventType,
      actorType: event.actorType,
      actorId: event.actorId ?? null,
      reason: event.reason ?? null,
      previousValue: { status: previous },
      newValue: { status: nextStatus },
    });
  } catch (err) {
    console.error("[transaction-record] failed to record event:", err);
  }
}

export function markTransactionDisputed(orderId: string, actorId: string | null, reason: string | null) {
  return transitionStatus(orderId, "disputed", {
    eventType: "dispute_opened",
    actorType: "buyer",
    actorId,
    reason,
  });
}

export function markTransactionRefunded(orderId: string, adminId: string | null, reason: string | null) {
  return transitionStatus(orderId, "refunded", {
    eventType: "refunded",
    actorType: adminId ? "admin" : "system",
    actorId: adminId,
    reason,
  });
}

// A dispute settled in the seller's favour returns the record to completed,
// and says so in the history rather than pretending the dispute never
// happened.
export function markTransactionDisputeResolved(orderId: string, adminId: string | null, reason: string | null) {
  return transitionStatus(orderId, "completed", {
    eventType: "dispute_resolved",
    actorType: adminId ? "admin" : "system",
    actorId: adminId,
    reason,
    allowSameStatus: true,
  });
}

/* -------------------------------------------------------------------------- */
/*  Reading                                                                    */
/* -------------------------------------------------------------------------- */

export type TransactionEvent = {
  eventType: string;
  actorType: string;
  reason: string | null;
  createdAt: string;
};

// What ANYONE holding the link may see. Built as an explicit object, never a
// filtered row, so a column added to transaction_records later cannot leak
// into the public page by default.
//
// Deliberately absent: the buyer entirely (no id, no name, no phone), the
// amount, the order reference, the product id, and every internal id. The
// amount is the notable omission — it is genuinely useful for provenance, but
// publishing what someone paid to anyone who receives the link is a privacy
// cost the verification purpose does not require. Buyer and seller both see
// it on their own private view.
export type PublicVerification = {
  code: string;
  itemName: string;
  sellerName: string;
  sellerVerificationLevel: VerificationLevel;
  completedAt: string;
  status: TransactionRecord["status"];
  // Just enough history for the page to be honest about what happened after
  // completion — types and dates, no actor identities, no reasons.
  timeline: { eventType: string; createdAt: string }[];
};

export async function getPublicVerification(rawCode: string): Promise<PublicVerification | null> {
  const code = normalizeTransactionCode(rawCode);
  if (!code) return null;

  const db = getDb();
  const result = await db
    .from("transaction_records")
    .select("id, code, item_name, seller_name, seller_verification_level, completed_at, status")
    .eq("code", code)
    .maybeSingle();
  const row = assertNoError(result, "verifying transaction") as Row | null;
  if (!row) return null;

  const eventsResult = await db
    .from("transaction_record_events")
    .select("event_type, created_at")
    .eq("transaction_record_id", row.id as string)
    .order("created_at", { ascending: true });
  const events = assertNoError(eventsResult, "loading transaction events") as Row[];

  return {
    code: row.code as string,
    itemName: row.item_name as string,
    sellerName: row.seller_name as string,
    sellerVerificationLevel: (row.seller_verification_level as VerificationLevel) ?? "new",
    completedAt: row.completed_at as string,
    status: (row.status as TransactionRecord["status"]) ?? "completed",
    timeline: events.map((e) => ({
      eventType: e.event_type as string,
      createdAt: e.created_at as string,
    })),
  };
}

// The private view, for the two parties to the transaction. Ownership is
// checked here rather than by the caller, so no route can forget to.
export async function getOwnTransactionRecord(
  code: string,
  viewer: { userId: string; sellerId: string | null; sellerName: string | null }
): Promise<(TransactionRecord & { events: TransactionEvent[] }) | null> {
  const normalized = normalizeTransactionCode(code);
  if (!normalized) return null;

  const db = getDb();
  const result = await db.from("transaction_records").select("*").eq("code", normalized).maybeSingle();
  const row = assertNoError(result, "loading transaction record") as Row | null;
  if (!row) return null;

  const record = rowToRecord(row);
  const isBuyer = record.buyerUserId === viewer.userId;
  // Seller match prefers the real id; the name fallback covers records whose
  // seller_id was null, exactly as listOrders does.
  const isSeller =
    (record.sellerId !== null && record.sellerId === viewer.sellerId) ||
    (record.sellerId === null && viewer.sellerName !== null && record.sellerName === viewer.sellerName);
  if (!isBuyer && !isSeller) return null;

  const eventsResult = await db
    .from("transaction_record_events")
    .select("event_type, actor_type, reason, created_at")
    .eq("transaction_record_id", record.id)
    .order("created_at", { ascending: true });
  const events = assertNoError(eventsResult, "loading transaction events") as Row[];

  return {
    ...record,
    events: events.map((e) => ({
      eventType: e.event_type as string,
      actorType: e.actor_type as string,
      reason: (e.reason as string | null) ?? null,
      createdAt: e.created_at as string,
    })),
  };
}

// Every record the viewer is a party to, for their order history and sales.
export async function listOwnTransactionRecords(viewer: {
  userId: string;
  sellerId: string | null;
  sellerName: string | null;
}): Promise<TransactionRecord[]> {
  const db = getDb();
  const queries = [db.from("transaction_records").select("*").eq("buyer_user_id", viewer.userId)];
  if (viewer.sellerId) queries.push(db.from("transaction_records").select("*").eq("seller_id", viewer.sellerId));
  if (viewer.sellerName) {
    queries.push(db.from("transaction_records").select("*").eq("seller_name", viewer.sellerName).is("seller_id", null));
  }

  const results = await Promise.all(queries);
  const rows = results.flatMap((r) => assertNoError(r, "listing transaction records") as Row[]);
  const byId = new Map<string, Row>();
  for (const row of rows) byId.set(row.id as string, row);

  return [...byId.values()]
    .map(rowToRecord)
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
}

// Admin investigation. Returns the full record plus its history; admins read
// it, they never rewrite it — a correction is an appended event, which is
// what addAdminCorrection below writes.
export async function getTransactionRecordForAdmin(
  code: string
): Promise<(TransactionRecord & { events: TransactionEvent[] }) | null> {
  const normalized = normalizeTransactionCode(code);
  if (!normalized) return null;

  const db = getDb();
  const result = await db.from("transaction_records").select("*").eq("code", normalized).maybeSingle();
  const row = assertNoError(result, "loading transaction record") as Row | null;
  if (!row) return null;
  const record = rowToRecord(row);

  const eventsResult = await db
    .from("transaction_record_events")
    .select("event_type, actor_type, reason, created_at")
    .eq("transaction_record_id", record.id)
    .order("created_at", { ascending: true });
  const events = assertNoError(eventsResult, "loading transaction events") as Row[];

  return {
    ...record,
    events: events.map((e) => ({
      eventType: e.event_type as string,
      actorType: e.actor_type as string,
      reason: (e.reason as string | null) ?? null,
      createdAt: e.created_at as string,
    })),
  };
}

// The only way an admin may annotate a record. It appends; it cannot touch a
// snapshot column, so the historical facts stay as they were recorded.
export async function addAdminCorrection(
  code: string,
  adminId: string,
  reason: string
): Promise<boolean> {
  const normalized = normalizeTransactionCode(code);
  if (!normalized) return false;

  const db = getDb();
  const result = await db.from("transaction_records").select("id").eq("code", normalized).maybeSingle();
  const row = assertNoError(result, "loading transaction record") as Row | null;
  if (!row) return false;

  await appendEvent({
    recordId: row.id as string,
    eventType: "admin_correction",
    actorType: "admin",
    actorId: adminId,
    reason,
  });
  return true;
}
