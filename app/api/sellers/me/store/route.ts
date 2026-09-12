import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSellerIdForUser } from "@/lib/repo";
import { claimStoreSlug, getOwnStoreState, storeUrl, appBaseUrl } from "@/lib/store";
import { checkRateLimit } from "@/lib/rateLimit";
import { errorResponse } from "@/lib/errors";

// A seller's own view of their dedicated storefront, and the one way to claim
// its URL. Eligibility is decided in lib/store.ts#getStoreEligibility from the
// live subscription, never from anything the client sends — the dashboard
// hiding a button is not enforcement.

async function currentSellerId(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || user.role !== "seller") {
    return { error: NextResponse.json({ error: "Seller access required." }, { status: 403 }) };
  }
  const sellerId = await getSellerIdForUser(user.id);
  if (!sellerId) {
    return { error: NextResponse.json({ error: "No store found for this account yet." }, { status: 404 }) };
  }
  return { sellerId, userId: user.id };
}

export async function GET(req: NextRequest) {
  const ctx = await currentSellerId(req);
  if ("error" in ctx) return ctx.error;

  try {
    return NextResponse.json({ store: await getOwnStoreState(ctx.sellerId, appBaseUrl()) });
  } catch (err) {
    return errorResponse(err, "Couldn't load your store link.");
  }
}

// Claim the store URL. Idempotent: claimStoreSlug returns the seller's
// existing slug if they already have one, so a double-tap or a retried
// request can never produce a second store or a second slug.
export async function POST(req: NextRequest) {
  const ctx = await currentSellerId(req);
  if ("error" in ctx) return ctx.error;

  // Slug allocation walks candidates and writes, so it is worth a cap even
  // though it is idempotent — a loop of requests from one account shouldn't
  // be able to churn the table.
  const limit = await checkRateLimit(`store-claim:${ctx.sellerId}`, 10, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const { slug, created } = await claimStoreSlug(ctx.sellerId);
    return NextResponse.json(
      { slug, url: storeUrl(slug, appBaseUrl()), created },
      // 201 only when this request actually created the slug; a repeat is a
      // plain 200 describing what already exists.
      { status: created ? 201 : 200 }
    );
  } catch (err) {
    return errorResponse(err, "Couldn't create your store link.");
  }
}
