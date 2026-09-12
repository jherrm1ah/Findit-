import { getDb, assertNoError } from "./db";
import { ValidationError } from "./errors";
import { getStorePlanOverview, FREE_STORE_PLAN_ID } from "./subscriptions";
import { isValidSlug, isReservedSlug, storeSlugCandidate } from "./storeSlug";
import { getPublicSellerProfile, type PublicSellerProfile } from "./sellerPublicProfile";
import { listPublicProductsForSeller } from "./repo";
import crypto from "crypto";

/* -------------------------------------------------------------------------- */
/*  Eligibility                                                                */
/* -------------------------------------------------------------------------- */

// A dedicated storefront is a PAID plan benefit. This is the single
// server-side authority for that rule — the dashboard may hide the button,
// but hiding a button is not enforcement.
//
// It reads getStorePlanOverview rather than the subscription row directly,
// because that path already resolves a lapsed trial or an unpaid period back
// to Free at read time (this app has no cron). So a seller whose trial ended
// an hour ago is correctly ineligible here without anything having run.
export type StoreEligibility = {
  eligible: boolean;
  planId: string;
  planName: string;
  // Why not, in words a seller can act on. Null when they are eligible.
  reason: string | null;
};

export async function getStoreEligibility(sellerId: string): Promise<StoreEligibility> {
  const { plan } = await getStorePlanOverview(sellerId);
  if (plan.id === FREE_STORE_PLAN_ID || plan.priceMonthly <= 0) {
    return {
      eligible: false,
      planId: plan.id,
      planName: plan.name,
      reason: "A dedicated store page comes with a paid Store plan. Upgrade to claim your own link.",
    };
  }
  return { eligible: true, planId: plan.id, planName: plan.name, reason: null };
}

/* -------------------------------------------------------------------------- */
/*  Claiming a slug                                                            */
/* -------------------------------------------------------------------------- */

type Row = Record<string, unknown>;

// Postgres unique-violation. The slug index is what actually decides who gets
// a contested slug, so this code path is the normal case under concurrency,
// not an error to be surprised by.
const UNIQUE_VIOLATION = "23505";
const MAX_ATTEMPTS = 8;

async function slugIsTaken(slug: string): Promise<boolean> {
  const db = getDb();
  const [live, alias] = await Promise.all([
    db.from("sellers").select("id").eq("store_slug", slug).maybeSingle(),
    db.from("store_slug_aliases").select("slug").eq("slug", slug).maybeSingle(),
  ]);
  return Boolean(
    (assertNoError(live, "checking slug") as Row | null) ||
      (assertNoError(alias, "checking slug alias") as Row | null)
  );
}

export type ClaimStoreResult = { slug: string; created: boolean };

// Idempotent by construction: a seller who already has a slug gets that same
// slug back, and `created: false`. A retried or double-submitted request can
// therefore never produce a second store or a second slug for one seller.
export async function claimStoreSlug(sellerId: string): Promise<ClaimStoreResult> {
  const db = getDb();

  const existingResult = await db
    .from("sellers")
    .select("id, name, status, store_slug")
    .eq("id", sellerId)
    .maybeSingle();
  const seller = assertNoError(existingResult, "loading seller") as Row | null;
  if (!seller) throw new ValidationError("Seller account not found.");

  if (seller.store_slug) return { slug: seller.store_slug as string, created: false };

  const eligibility = await getStoreEligibility(sellerId);
  if (!eligibility.eligible) throw new ValidationError(eligibility.reason!);

  const name = (seller.name as string) || "store";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = storeSlugCandidate(name, attempt, crypto.randomBytes(3).toString("hex"));
    if (isReservedSlug(candidate) || !isValidSlug(candidate)) continue;
    // Cheap pre-check against retired slugs, which have no unique index
    // shared with sellers.store_slug and so cannot be caught by the
    // constraint below.
    if (await slugIsTaken(candidate)) continue;

    const result = await db
      .from("sellers")
      .update({ store_slug: candidate, store_slug_claimed_at: new Date().toISOString() })
      .eq("id", sellerId)
      // Only claim if this seller still has no slug, so two concurrent
      // requests for the SAME seller can't both write one.
      .is("store_slug", null)
      .select("store_slug")
      .maybeSingle();

    if (result.error) {
      if (result.error.code === UNIQUE_VIOLATION) continue; // someone else took it; try the next candidate
      throw new Error(`claiming store slug: ${result.error.message}`);
    }

    const row = result.data as Row | null;
    if (row?.store_slug) return { slug: row.store_slug as string, created: true };

    // The `.is("store_slug", null)` guard matched nothing, meaning a
    // concurrent request for this same seller won. Return that winner rather
    // than trying again.
    const reread = await db.from("sellers").select("store_slug").eq("id", sellerId).maybeSingle();
    const winner = assertNoError(reread, "re-reading store slug") as Row | null;
    if (winner?.store_slug) return { slug: winner.store_slug as string, created: false };
  }

  throw new ValidationError("Couldn't reserve a store link for this name. Try a slightly different store name.");
}

/* -------------------------------------------------------------------------- */
/*  Public resolution                                                          */
/* -------------------------------------------------------------------------- */

export type PublicStore = {
  slug: string;
  // Set when the visitor arrived on a retired slug, so the page can point at
  // the current one rather than silently serving a stale URL.
  canonicalSlug: string;
  planName: string;
  profile: PublicSellerProfile;
};

export type PublicStoreResult =
  | { status: "ok"; store: PublicStore }
  | { status: "not_found" }
  // The store exists but its plan no longer includes a public page — a
  // downgrade or a lapsed trial. Deliberately distinct from not_found so the
  // page can say "this store isn't open right now" instead of pretending the
  // seller never existed, and so the slug stays reserved for them.
  | { status: "unavailable" };

async function sellerIdForSlug(slug: string): Promise<{ id: string; canonicalSlug: string } | null> {
  const db = getDb();

  const liveResult = await db.from("sellers").select("id, store_slug").eq("store_slug", slug).maybeSingle();
  const live = assertNoError(liveResult, "resolving store slug") as Row | null;
  if (live) return { id: live.id as string, canonicalSlug: live.store_slug as string };

  const aliasResult = await db.from("store_slug_aliases").select("seller_id").eq("slug", slug).maybeSingle();
  const alias = assertNoError(aliasResult, "resolving store slug alias") as Row | null;
  if (!alias) return null;

  const ownerResult = await db
    .from("sellers")
    .select("id, store_slug")
    .eq("id", alias.seller_id as string)
    .maybeSingle();
  const owner = assertNoError(ownerResult, "resolving alias owner") as Row | null;
  if (!owner) return null;
  return { id: owner.id as string, canonicalSlug: (owner.store_slug as string | null) ?? slug };
}

// The public storefront behind /store/<slug>.
//
// Reuses getPublicSellerProfile for the response body rather than assembling
// a second one, so there is exactly one definition of what a buyer may see
// about a seller. That module names the columns it reads and builds an
// explicit object, which is what keeps bank details, admin notes and
// verification evidence out of this page too.
export async function getPublicStoreBySlug(slug: string): Promise<PublicStoreResult> {
  // Validate before querying: the slug arrives from a URL segment, and
  // everything downstream should only ever see a plain slug.
  if (!isValidSlug(slug)) return { status: "not_found" };

  const resolved = await sellerIdForSlug(slug);
  if (!resolved) return { status: "not_found" };

  // A suspended or rejected seller answers not_found here, exactly as they do
  // on the seller profile — same rule, one implementation.
  const profileResult = await getPublicSellerProfile(resolved.id, listPublicProductsForSeller);
  if (profileResult.status !== "ok") return { status: "not_found" };

  // Eligibility is checked LAST and separately from existence, so a lapsed
  // store is "closed" rather than "never existed" — its slug stays reserved
  // and its data untouched, and it reopens by itself when the plan is
  // restored.
  const eligibility = await getStoreEligibility(resolved.id);
  if (!eligibility.eligible) return { status: "unavailable" };

  return {
    status: "ok",
    store: {
      slug,
      canonicalSlug: resolved.canonicalSlug,
      planName: eligibility.planName,
      profile: profileResult.profile,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  The seller's own view of their store                                       */
/* -------------------------------------------------------------------------- */

export type OwnStoreState = {
  slug: string | null;
  url: string | null;
  eligible: boolean;
  planId: string;
  planName: string;
  reason: string | null;
  // True when a slug exists but the plan no longer publishes it. The seller
  // keeps the link; it simply isn't live until they upgrade again.
  claimedButUnavailable: boolean;
};

export async function getOwnStoreState(sellerId: string, baseUrl: string | null): Promise<OwnStoreState> {
  const db = getDb();
  const result = await db.from("sellers").select("store_slug").eq("id", sellerId).maybeSingle();
  const row = assertNoError(result, "loading own store") as Row | null;
  const slug = (row?.store_slug as string | null) ?? null;

  const eligibility = await getStoreEligibility(sellerId);

  return {
    slug,
    url: slug ? storeUrl(slug, baseUrl) : null,
    eligible: eligibility.eligible,
    planId: eligibility.planId,
    planName: eligibility.planName,
    reason: eligibility.reason,
    claimedButUnavailable: Boolean(slug) && !eligibility.eligible,
  };
}

// The public URL for a slug. The origin comes from configuration, never from
// a hardcoded domain: APP_URL if set, else the deployment's own URL, else a
// site-relative path that still works wherever the app happens to be served.
export function storeUrl(slug: string, baseUrl: string | null): string {
  const path = `/store/${slug}`;
  const base = (baseUrl || appBaseUrl() || "").replace(/\/+$/, "");
  return base ? `${base}${path}` : path;
}

export function appBaseUrl(): string | null {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  // Vercel sets this to the deployment's host, without a scheme.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
  return vercel ? `https://${vercel.replace(/\/+$/, "")}` : null;
}
