import { getDb, assertNoError } from "./db";
import { ValidationError } from "./errors";
import { notifyBestEffort, findUserForSellerId, findUserByBusinessName } from "./repo";

type Row = Record<string, unknown>;

// Real listing boosts — a seller pays (via Paystack) to move one of their
// own listings to the front of Home/Browse for a fixed window. Pricing
// lives in boost_plans as DATA (same "price/limits as data, not code"
// pattern as subscription_plans, see lib/subscriptions.ts), so an admin can
// change "₦1,000 for 3 days" without a deploy. The purchase INITIATION
// (creating the pending payment row, calling Paystack) lives in the route
// (app/api/products/[id]/boost), the same split already used for order/
// subscription checkout — this file is the business logic underneath it.

export type BoostPlan = {
  id: string;
  name: string;
  durationDays: number;
  price: number;
  sortOrder: number;
  active: boolean;
};

function rowToBoostPlan(row: Row): BoostPlan {
  return {
    id: row.id as string,
    name: row.name as string,
    durationDays: row.duration_days as number,
    price: row.price as number,
    sortOrder: row.sort_order as number,
    active: Boolean(row.active),
  };
}

// Seller-facing — active plans only, in display order.
export async function listBoostPlans(): Promise<BoostPlan[]> {
  const db = getDb();
  const result = await db.from("boost_plans").select("*").eq("active", true).order("sort_order", { ascending: true });
  const rows = assertNoError(result, "listing boost plans") as Row[];
  return rows.map(rowToBoostPlan);
}

export async function getBoostPlan(id: string): Promise<BoostPlan | null> {
  const db = getDb();
  const result = await db.from("boost_plans").select("*").eq("id", id).maybeSingle();
  const row = assertNoError(result, "loading boost plan") as Row | null;
  return row ? rowToBoostPlan(row) : null;
}

// Admin-only — includes inactive plans.
export async function listAllBoostPlansForAdmin(): Promise<BoostPlan[]> {
  const db = getDb();
  const result = await db.from("boost_plans").select("*").order("sort_order", { ascending: true });
  const rows = assertNoError(result, "listing all boost plans") as Row[];
  return rows.map(rowToBoostPlan);
}

const BOOST_PLAN_PATCH_COLUMNS: Record<string, string> = {
  name: "name",
  durationDays: "duration_days",
  price: "price",
  sortOrder: "sort_order",
  active: "active",
};

export async function updateBoostPlan(id: string, patch: Partial<Omit<BoostPlan, "id">>): Promise<BoostPlan> {
  // Unlike setPlatformFeeBps (lib/payments.ts), this had no range/integer
  // check at all — a negative/zero price or durationDays would persist
  // unrejected and flow straight into a real Paystack charge
  // (amountNaira: plan.price) or a no-op boost (endsAt computed from
  // durationDays). Admin-only input, but a typo here is still real money.
  if (patch.price !== undefined && (!Number.isFinite(patch.price) || patch.price < 0)) {
    throw new ValidationError("Price can't be negative.");
  }
  if (patch.durationDays !== undefined && (!Number.isInteger(patch.durationDays) || patch.durationDays <= 0)) {
    throw new ValidationError("Duration must be a positive whole number of days.");
  }
  if (patch.sortOrder !== undefined && !Number.isInteger(patch.sortOrder)) {
    throw new ValidationError("Sort order must be a whole number.");
  }

  const columns: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const column = BOOST_PLAN_PATCH_COLUMNS[key];
    if (column) columns[column] = value;
  }
  if (Object.keys(columns).length === 0) {
    throw new ValidationError("No editable fields provided.");
  }
  columns.updated_at = new Date().toISOString();

  const db = getDb();
  const result = await db.from("boost_plans").update(columns).eq("id", id).select().single();
  const row = assertNoError(result, "updating boost plan") as Row;
  return rowToBoostPlan(row);
}

// The ONLY place a boost is ever activated — called from the Paystack
// webhook once the charge is confirmed, never on a client-supplied "I
// paid." Extends from whichever is later, now or the listing's current
// boosted_until, so buying a second boost while one is still running adds
// on top of it rather than a shorter plan overwriting a longer remaining
// window.
//
// This is additive, not a no-op, so it must never run twice for the same
// payment — the webhook can legitimately redeliver the same charge.success
// event, and two redeliveries can genuinely overlap in flight (nothing
// serializes them). paymentId (migration 029, unique) is the atomic claim:
// the boosts insert below is what decides which of two overlapping calls
// for the same payment is "the" one that gets to compute this boost's own
// ends_at — the loser just adopts the winner's row instead of also reading
// a stale boosted_until and adding the full duration on top of it again.
//
// The products.boosted_until write is kept separate and retried against
// THIS boost's own already-decided ends_at (never recomputed) — plain
// "raise it, never lower it" via a re-readable loop, no real DB transaction
// available through this client — so a failure on that specific step (the
// insert above already having committed) is still recoverable on retry
// instead of the row existing forever quietly meaning "nothing left to do"
// while the product itself never actually got boosted.
const UNIQUE_VIOLATION = "23505";
const MAX_BOOST_APPLY_ATTEMPTS = 5;

async function applyBoostedUntil(db: ReturnType<typeof getDb>, productId: string, endsAtIso: string): Promise<void> {
  for (let attempt = 0; attempt < MAX_BOOST_APPLY_ATTEMPTS; attempt++) {
    const productResult = await db.from("products").select("boosted_until").eq("id", productId).maybeSingle();
    const product = assertNoError(productResult, "loading product for boost activation") as Row | null;
    if (!product) return; // listing was deleted since — nothing left to boost
    const current = (product.boosted_until as string | null) ?? null;
    if (current && new Date(current).getTime() >= new Date(endsAtIso).getTime()) return; // already at least this far

    // Optimistic concurrency against the exact value just read — if a
    // concurrent boost (a different payment) landed in between, that write
    // must not be clobbered by this one; retry against its result. .is()
    // for null (never boosted before), .eq() otherwise — PostgREST's .eq()
    // does not match NULL rows.
    //
    // boost_expiry_notified_at resets to null in this same write (see
    // migration 030): raising boosted_until means there's a new expiry to
    // eventually notify the seller about, and leaving an old notified
    // timestamp in place would make notifyExpiredBoosts below mistake this
    // fresh extension for one it already told the seller about.
    let query = db.from("products").update({ boosted_until: endsAtIso, boost_expiry_notified_at: null }).eq("id", productId);
    query = current === null ? query.is("boosted_until", null) : query.eq("boosted_until", current);
    const updateResult = await query.select("id").maybeSingle();
    const claimed = assertNoError(updateResult, "activating boost") as Row | null;
    if (claimed) return;
  }

  // Exhausted every attempt — the boosts row (the actual charge) already
  // committed before this ran, so the seller was charged but boosted_until
  // never got raised. Silent here would mean no trace of a paid-for boost
  // placement that never took effect; log it so it's at least visible
  // server-side instead of looking like nothing happened at all.
  console.error(
    `[boosts] applyBoostedUntil exhausted ${MAX_BOOST_APPLY_ATTEMPTS} attempts for product ${productId} — boosted_until was not raised to ${endsAtIso}.`
  );
}

// Called on a schedule (see app/api/cron/expirations, vercel.json) — unlike
// the sort order on Home/Browse, which never needed a cron because it just
// stops caring once now() > boosted_until, telling the SELLER their boost
// ended has nothing else to trigger it: no read path exists that a seller
// who stopped opening the app would ever hit. Checked against the
// product's live boosted_until, not any single boosts row's own ends_at —
// see migration 030's comment for why a stacked, still-active boost must
// never be mistaken for an expired one.
export async function notifyExpiredBoosts(): Promise<number> {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const result = await db
    .from("products")
    .select("id, name, seller, seller_id, boosted_until")
    .lte("boosted_until", nowIso)
    .is("boost_expiry_notified_at", null);
  const rows = assertNoError(result, "finding products whose boost just expired") as Row[];

  let notified = 0;
  for (const row of rows) {
    // Conditioned on boosted_until still matching exactly what was just
    // read — a seller buying a fresh boost between the select above and
    // here (which both raises boosted_until and clears this flag) must not
    // have that brand-new, still-unnotified extension clobbered by this
    // claim for the old one.
    const claimResult = await db
      .from("products")
      .update({ boost_expiry_notified_at: nowIso })
      .eq("id", row.id as string)
      .eq("boosted_until", row.boosted_until as string)
      .select("id")
      .maybeSingle();
    const claimed = assertNoError(claimResult, "claiming boost expiry notification") as Row | null;
    if (!claimed) continue; // lost the claim — another sweep run, or a fresh boost, got here first

    const sellerId = row.seller_id as string | null;
    const businessName = row.seller as string | null;
    const seller = sellerId ? await findUserForSellerId(sellerId) : businessName ? await findUserByBusinessName(businessName) : null;
    if (!seller) continue;

    await notifyBestEffort({
      userId: seller.id,
      type: "boost",
      title: "Boost ended",
      body: `Your boost for "${row.name}" has ended — it's no longer getting the extra placement on Home/Browse.`,
    });
    notified++;
  }
  return notified;
}

export async function activateBoost(input: {
  productId: string;
  sellerId: string;
  boostPlanId: string;
  amount: number;
  paymentId: string;
}): Promise<void> {
  const db = getDb();
  const existingResult = await db.from("boosts").select("ends_at").eq("payment_id", input.paymentId).maybeSingle();
  const existing = assertNoError(existingResult, "checking for an existing boost") as Row | null;
  if (existing) {
    await applyBoostedUntil(db, input.productId, existing.ends_at as string);
    return;
  }

  const plan = await getBoostPlan(input.boostPlanId);
  if (!plan) throw new Error(`activateBoost: boost plan ${input.boostPlanId} not found`);

  const productResult = await db.from("products").select("boosted_until").eq("id", input.productId).maybeSingle();
  const product = assertNoError(productResult, "loading product for boost activation") as Row | null;
  if (!product) throw new Error(`activateBoost: product ${input.productId} not found`);

  const currentBoostedUntil = product.boosted_until ? new Date(product.boosted_until as string).getTime() : 0;
  const base = Math.max(Date.now(), currentBoostedUntil);
  const endsAt = new Date(base + plan.durationDays * 24 * 60 * 60 * 1000);

  const insertResult = await db.from("boosts").insert({
    id: "boost_" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase(),
    product_id: input.productId,
    seller_id: input.sellerId,
    boost_plan_id: input.boostPlanId,
    amount: input.amount,
    payment_id: input.paymentId,
    ends_at: endsAt.toISOString(),
  });
  if (insertResult.error) {
    if (insertResult.error.code !== UNIQUE_VIOLATION) {
      throw new Error(`recording boost purchase: ${insertResult.error.message}`);
    }
    // Lost the claim to an overlapping call — adopt its ends_at rather
    // than the one just computed here (which read a now-stale boosted_until).
    const raceResult = await db.from("boosts").select("ends_at").eq("payment_id", input.paymentId).maybeSingle();
    const raced = assertNoError(raceResult, "re-reading boost after a race") as Row | null;
    if (raced) await applyBoostedUntil(db, input.productId, raced.ends_at as string);
    return;
  }

  await applyBoostedUntil(db, input.productId, endsAt.toISOString());
}
