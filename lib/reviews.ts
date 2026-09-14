// A review's real, findable, answerable form — see migration 025 for why
// this exists alongside orders.reviewed/my_rating/review_comment rather than
// replacing them: every seller-rating computation in this app
// (lib/repo.ts#getSellerStatsMap, lib/sellerPublicProfile.ts,
// lib/sellerDirectory.ts) already reads those columns, and this file does
// not change that. What it adds is what those two columns never gave
// anyone: a review other buyers can actually read, and a seller can reply
// to.

import crypto from "crypto";
import { getDb, assertNoError } from "./db";
import { ValidationError } from "./errors";
import type { Order } from "./repo";

type Row = Record<string, unknown>;
const UNIQUE_VIOLATION = "23505";

export type Review = {
  id: string;
  orderId: string;
  sellerId: string | null;
  sellerName: string;
  rating: number;
  comment: string | null;
  sellerReply: string | null;
  sellerRepliedAt: string | null;
  createdAt: string;
};

// What anyone else may see about a review — never the buyer's own identity.
// Same stance as lib/transactionRecord.ts's PublicVerification: a review is
// evidence about the SELLER, and publishing who wrote it is not what that
// requires.
export type PublicReview = {
  id: string;
  rating: number;
  comment: string | null;
  sellerReply: string | null;
  sellerRepliedAt: string | null;
  createdAt: string;
};

export type SellerIdentity = { sellerId: string | null; sellerName: string };

function randomId(prefix: string): string {
  return `${prefix}${crypto.randomBytes(9).toString("hex")}`;
}

function rowToReview(row: Row): Review {
  return {
    id: row.id as string,
    orderId: row.order_id as string,
    sellerId: (row.seller_id as string | null) ?? null,
    sellerName: row.seller_name as string,
    rating: row.rating as number,
    comment: (row.comment as string | null) ?? null,
    sellerReply: (row.seller_reply as string | null) ?? null,
    sellerRepliedAt: (row.seller_replied_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

function toPublicReview(review: Review): PublicReview {
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    sellerReply: review.sellerReply,
    sellerRepliedAt: review.sellerRepliedAt,
    createdAt: review.createdAt,
  };
}

/* -------------------------------------------------------------------------- */
/*  Creation                                                                   */
/* -------------------------------------------------------------------------- */

// Called from lib/repo.ts#submitOrderReview right after the order itself is
// saved as reviewed. Mirrors lib/transactionRecord.ts#recordCompletedTransaction's
// own contract: never throws into the caller's path. A review the buyer has
// already been told succeeded (the order's own reviewed/my_rating/
// review_comment columns, which is what every rating computation in this
// app reads) must not be undone because this second, purely-additive write
// failed — the failure is logged, not raised. The unique constraint on
// order_id is what actually keeps this idempotent under a retried call.
export async function recordReview(
  order: Order,
  buyerUserId: string,
  review: { rating: number; comment: string | null }
): Promise<void> {
  try {
    const db = getDb();
    const result = await db.from("reviews").insert({
      id: randomId("rvw_"),
      order_id: order.id,
      buyer_user_id: buyerUserId,
      seller_id: order.sellerId,
      seller_name: order.seller,
      rating: review.rating,
      comment: review.comment,
    });
    if (result.error && result.error.code !== UNIQUE_VIOLATION) {
      throw new Error(result.error.message);
    }
  } catch (err) {
    console.error("[reviews] failed to record review:", err);
  }
}

/* -------------------------------------------------------------------------- */
/*  Seller replies                                                             */
/* -------------------------------------------------------------------------- */

// Pure: does this seller identity own this review? seller_id is the
// reliable key whenever the review has one; the business name is the
// fallback ONLY for a review whose order predates the seller_id backfill
// (migration 009) and so was recorded with seller_id null — the exact same
// reasoning seller_id exists for everywhere else in this codebase (see
// lib/sellerIdentityMatch.ts). A review that DOES have a seller_id can never
// be claimed through the name fallback, so two sellers sharing a business
// name can never reply to each other's reviews.
export function sellerOwnsReview(
  review: { sellerId: string | null; sellerName: string },
  seller: SellerIdentity
): boolean {
  if (review.sellerId !== null) return review.sellerId === seller.sellerId;
  return review.sellerName === seller.sellerName;
}

const MAX_REPLY_LENGTH = 500;

export async function replyToReview(reviewId: string, seller: SellerIdentity, replyBody: string): Promise<Review | null> {
  const trimmed = replyBody.trim();
  if (trimmed.length < 2) {
    throw new ValidationError("Write a short reply before sending.");
  }
  if (trimmed.length > MAX_REPLY_LENGTH) {
    throw new ValidationError(`Keep your reply under ${MAX_REPLY_LENGTH} characters.`);
  }

  const db = getDb();
  const existingResult = await db.from("reviews").select("*").eq("id", reviewId).maybeSingle();
  const existingRow = assertNoError(existingResult, "loading review") as Row | null;
  if (!existingRow) return null;
  const review = rowToReview(existingRow);
  if (!sellerOwnsReview(review, seller)) return null;

  const updateResult = await db
    .from("reviews")
    .update({ seller_reply: trimmed, seller_replied_at: new Date().toISOString() })
    .eq("id", reviewId)
    .select()
    .maybeSingle();
  const updatedRow = assertNoError(updateResult, "saving seller reply") as Row | null;
  return updatedRow ? rowToReview(updatedRow) : null;
}

/* -------------------------------------------------------------------------- */
/*  Reading                                                                    */
/* -------------------------------------------------------------------------- */

// Every review a buyer or a stranger may see about this seller. Strict
// seller_id match only — the same trade-off lib/sellerDirectory.ts makes: a
// review whose order predates the seller_id backfill won't surface here
// even though it still counts toward the seller's rating elsewhere
// (lib/repo.ts#getSellerStatsMap). Under-showing is the safe side of a
// mistake for real buyer-written text attributed publicly to one account —
// unlike a bare number, a wrongly-attributed review is not a rounding error.
export async function listPublicReviewsForSeller(sellerId: string, limit = 50): Promise<PublicReview[]> {
  const db = getDb();
  const result = await db
    .from("reviews")
    .select("*")
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = assertNoError(result, "listing seller reviews") as Row[];
  return rows.map(rowToReview).map(toPublicReview);
}

// The seller's own view of everything written about them — same seller_id +
// legacy-name-fallback rule as lib/repo.ts#listOrders, so a review whose
// order predates the backfill still reaches the right account without
// merging two sellers who happen to share a business name.
export async function listOwnReviews(seller: SellerIdentity): Promise<Review[]> {
  const db = getDb();
  const queries = [db.from("reviews").select("*").eq("seller_name", seller.sellerName).is("seller_id", null)];
  if (seller.sellerId) queries.push(db.from("reviews").select("*").eq("seller_id", seller.sellerId));

  const results = await Promise.all(queries);
  const rows = results.flatMap((r) => assertNoError(r, "listing your reviews") as Row[]);
  const byId = new Map<string, Row>();
  for (const row of rows) byId.set(row.id as string, row);

  return [...byId.values()]
    .map(rowToReview)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
