import { getDb, assertNoError } from "./db";
import { computeVerificationLevel, type VerificationLevel, type VerificationStatus } from "./sellerVerificationLevels";
import { buildSellerNameIndex, matchSellerIdByName } from "./sellerIdentityMatch";
import { getStorePlanDisplayMap, FREE_STORE_PLAN_ID } from "./subscriptions";
import type { Product } from "./repo";

/* -------------------------------------------------------------------------- */
/*  The PUBLIC face of a seller — a deliberate allowlist, not a filtered row    */
/* -------------------------------------------------------------------------- */

// The sellers table holds, alongside the storefront fields, a bank account
// number, a bank code, an account name, a Paystack recipient code, the owning
// user id, an admin's rejection reason, a suspension reason, and the identity
// of the admin who reviewed them. None of that may ever reach a buyer.
//
// So this module never selects a seller row and strips fields off it — one
// new column added upstream and a "strip the bad ones" approach leaks by
// default. It names the columns it reads, and builds an object with only the
// keys below. Anything not listed here cannot be returned by construction.
//
// Deliberately NOT public, even though they look harmless:
//   - social_links: collected as verification EVIDENCE, not as storefront
//     decoration. It is not ours to republish.
//   - verification_status: buyers get the derived level ("new"/"verified"/
//     "trusted"), never the raw review state, which would expose that a
//     seller is mid-review or was rejected.
//   - status / status_reason: whether an account is pending or why it was
//     suspended is between that seller and FindIt.
export type PublicSellerProfile = {
  id: string;
  name: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  sellerType: string | null;
  category: string | null;
  description: string | null;
  yearsSelling: string | null;
  hasPhysicalStore: boolean | null;
  // The coarse area a seller chose to publish during verification — never the
  // precise shop address, which lives in seller_verification_details and is
  // not read by this module at all.
  location: string | null;
  memberSince: string | null;
  verificationLevel: VerificationLevel;
  proBadge: boolean;
  // The seller's dedicated storefront, but ONLY while their paid plan
  // actually publishes it. A downgraded seller keeps their slug (it stays
  // reserved for them) and this goes back to null, so the profile never
  // advertises a link that would land on a closed store.
  storeSlug: string | null;
  rating: number | null;
  reviewCount: number;
  completedOrderCount: number;
  listings: Product[];
};

export type PublicSellerProfileResult =
  | { status: "ok"; profile: PublicSellerProfile }
  | { status: "not_found" }
  // Two seller accounts genuinely share a business name, so a name-keyed
  // lookup has no single right answer. Refusing beats picking one and
  // attributing a stranger's storefront to them.
  | { status: "ambiguous"; candidateSellerIds: string[] };

// Only these columns are ever read. Adding a column to the sellers table does
// not silently widen what a buyer can see.
const PUBLIC_SELLER_COLUMNS =
  "id, name, status, logo_url, banner_url, seller_type, category, description, years_selling, has_physical_store, public_state, public_city, public_area, verification_status, store_slug, created_at";

// A suspended or rejected seller has no storefront. Returning "not found"
// rather than "suspended" is deliberate: a buyer has no business learning
// that a specific account was punished, and a neutral answer makes an
// account that never existed indistinguishable from one that was removed.
//
// Pending IS visible. A pending seller cannot transact (see
// assertSellerCanTransact) and so has nothing to sell, but they are a real
// account a buyer may reach from an older order, and hiding them would make
// the app look broken rather than deliberate.
const PUBLICLY_VISIBLE_STATUSES = new Set(["approved", "pending"]);

type Row = Record<string, unknown>;

// Accepts either a seller id or a business name. The id is the correct key
// and the only unambiguous one; the name path exists for listings created
// before seller_id was backfilled (migration 009), and refuses rather than
// guesses when a name maps to more than one account.
async function resolveSellerId(idOrName: string): Promise<PublicSellerProfileResult | { status: "resolved"; id: string }> {
  const db = getDb();

  const byId = await db.from("sellers").select("id").eq("id", idOrName).maybeSingle();
  const idRow = assertNoError(byId, "resolving seller") as Row | null;
  if (idRow) return { status: "resolved", id: idRow.id as string };

  const byName = await db.from("sellers").select("id, name").eq("name", idOrName);
  const nameRows = assertNoError(byName, "resolving seller by name") as Row[];
  const match = matchSellerIdByName(
    idOrName,
    buildSellerNameIndex(nameRows.map((r) => ({ id: r.id as string, name: r.name as string })))
  );
  if (match.status === "matched") return { status: "resolved", id: match.sellerId };
  if (match.status === "ambiguous") {
    return { status: "ambiguous", candidateSellerIds: match.candidateSellerIds };
  }
  return { status: "not_found" };
}

export async function getPublicSellerProfile(
  idOrName: string,
  // Injected so the route reuses the same product shaping (and the same
  // active/boost/plan rules) buyers see everywhere else, rather than this
  // module growing a second, subtly different product query.
  listSellerProducts: (seller: { id: string; name: string }) => Promise<Product[]>
): Promise<PublicSellerProfileResult> {
  const trimmed = idOrName?.trim();
  if (!trimmed) return { status: "not_found" };

  const resolved = await resolveSellerId(trimmed);
  if (resolved.status !== "resolved") return resolved;

  const db = getDb();
  const sellerResult = await db
    .from("sellers")
    .select(PUBLIC_SELLER_COLUMNS)
    .eq("id", resolved.id)
    .maybeSingle();
  const row = assertNoError(sellerResult, "loading seller profile") as Row | null;
  if (!row) return { status: "not_found" };
  if (!PUBLICLY_VISIBLE_STATUSES.has(row.status as string)) return { status: "not_found" };

  const name = row.name as string;

  // Reputation is computed from real order history, never stored on the
  // seller row and never sent by a client. Ratings come only from orders the
  // buyer actually reviewed; the completed count comes from escrow outcomes,
  // because most buyers never leave a review and rating-based counts would
  // badly undercount a seller's real track record.
  const [reviewedResult, outcomeResult, planMap] = await Promise.all([
    db.from("orders").select("my_rating").eq("seller", name).eq("reviewed", true),
    db.from("orders").select("escrow_status").eq("seller", name).in("escrow_status", ["released", "disputed"]),
    getStorePlanDisplayMap(),
  ]);
  const reviewed = assertNoError(reviewedResult, "loading seller reviews") as Row[];
  const outcomes = assertNoError(outcomeResult, "loading seller order outcomes") as Row[];

  const ratings = reviewed
    .map((r) => r.my_rating as number | null)
    .filter((r): r is number => typeof r === "number");
  const rating = ratings.length ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)) : null;
  const completedOrderCount = outcomes.filter((r) => r.escrow_status === "released").length;
  const disputeCount = outcomes.filter((r) => r.escrow_status === "disputed").length;

  const location =
    [row.public_area, row.public_city, row.public_state]
      .filter((v): v is string => Boolean(v && String(v).trim()))
      .join(", ") || null;

  const display = planMap.get(resolved.id);

  return {
    status: "ok",
    profile: {
      id: resolved.id,
      name,
      logoUrl: (row.logo_url as string | null) ?? null,
      bannerUrl: (row.banner_url as string | null) ?? null,
      sellerType: (row.seller_type as string | null) ?? null,
      category: (row.category as string | null) ?? null,
      description: (row.description as string | null) ?? null,
      yearsSelling: (row.years_selling as string | null) ?? null,
      hasPhysicalStore: (row.has_physical_store as boolean | null) ?? null,
      location,
      memberSince: (row.created_at as string | null) ?? null,
      verificationLevel: computeVerificationLevel({
        verificationStatus: row.verification_status as VerificationStatus,
        orderCount: completedOrderCount,
        disputeCount,
        avgRating: rating,
      }),
      proBadge: display?.proBadge ?? false,
      storeSlug:
        display && display.planId !== FREE_STORE_PLAN_ID ? ((row.store_slug as string | null) ?? null) : null,
      rating,
      reviewCount: ratings.length,
      completedOrderCount,
      listings: await listSellerProducts({ id: resolved.id, name }),
    },
  };
}
