import { getDb, assertNoError } from "./db";
import { ValidationError } from "./errors";
import { notifyBestEffort, findUserForSellerId } from "./repo";

type Row = Record<string, unknown>;

// Paid Sponsored slides in Home's promo carousel — see migration 040 and
// supabase/schema.sql for the full design note. This mirrors lib/boosts.ts
// closely: ad_campaign_plans holds pricing as DATA (same "price/limits as
// data, not code" pattern as subscription_plans/boost_plans), the purchase
// INITIATION (pending payment row, Paystack call) lives in the route
// (app/api/sellers/me/ad-campaigns), and activation only ever happens from
// the Paystack webhook once a charge is confirmed.
//
// Unlike a boost, which extends one shared products.boosted_until and so
// needs the CAS retry dance in lib/boosts.ts#applyBoostedUntil, each
// campaign is its own independent row — there's nothing shared to race
// over, so activateCampaign is a plain idempotent insert.

export type AdCampaignPlan = {
  id: string;
  name: string;
  durationDays: number;
  price: number;
  sortOrder: number;
  active: boolean;
};

function rowToAdCampaignPlan(row: Row): AdCampaignPlan {
  return {
    id: row.id as string,
    name: row.name as string,
    durationDays: row.duration_days as number,
    price: row.price as number,
    sortOrder: row.sort_order as number,
    active: Boolean(row.active),
  };
}

export type AdCampaign = {
  id: string;
  sellerId: string;
  planId: string;
  headline: string;
  body: string;
  ctaLabel: string;
  imageUrl: string;
  targetProductId: string | null;
  amount: number;
  startsAt: string;
  endsAt: string;
  takenDownAt: string | null;
  takenDownReason: string | null;
  // Migration 041 — real, counted-at-serve-time (impressions) and
  // counted-at-tap-time (clicks) numbers, never projected. See
  // pickAdCampaignForImpression/recordAdCampaignClick below.
  impressions: number;
  clicks: number;
  createdAt: string;
};

function rowToAdCampaign(row: Row): AdCampaign {
  return {
    id: row.id as string,
    sellerId: row.seller_id as string,
    planId: row.plan_id as string,
    headline: row.headline as string,
    body: row.body as string,
    ctaLabel: row.cta_label as string,
    imageUrl: row.image_url as string,
    targetProductId: (row.target_product_id as string | null) ?? null,
    amount: row.amount as number,
    startsAt: row.starts_at as string,
    endsAt: row.ends_at as string,
    takenDownAt: (row.taken_down_at as string | null) ?? null,
    takenDownReason: (row.taken_down_reason as string | null) ?? null,
    impressions: (row.impressions as number | null) ?? 0,
    clicks: (row.clicks as number | null) ?? 0,
    createdAt: row.created_at as string,
  };
}

// Seller-facing — active plans only, in display order.
export async function listAdCampaignPlans(): Promise<AdCampaignPlan[]> {
  const db = getDb();
  const result = await db.from("ad_campaign_plans").select("*").eq("active", true).order("sort_order", { ascending: true });
  const rows = assertNoError(result, "listing ad campaign plans") as Row[];
  return rows.map(rowToAdCampaignPlan);
}

export async function getAdCampaignPlan(id: string): Promise<AdCampaignPlan | null> {
  const db = getDb();
  const result = await db.from("ad_campaign_plans").select("*").eq("id", id).maybeSingle();
  const row = assertNoError(result, "loading ad campaign plan") as Row | null;
  return row ? rowToAdCampaignPlan(row) : null;
}

// Admin-only — includes inactive plans.
export async function listAllAdCampaignPlansForAdmin(): Promise<AdCampaignPlan[]> {
  const db = getDb();
  const result = await db.from("ad_campaign_plans").select("*").order("sort_order", { ascending: true });
  const rows = assertNoError(result, "listing all ad campaign plans") as Row[];
  return rows.map(rowToAdCampaignPlan);
}

const PLAN_PATCH_COLUMNS: Record<string, string> = {
  name: "name",
  durationDays: "duration_days",
  price: "price",
  sortOrder: "sort_order",
  active: "active",
};

export async function updateAdCampaignPlan(id: string, patch: Partial<Omit<AdCampaignPlan, "id">>): Promise<AdCampaignPlan> {
  // Same reasoning as lib/boosts.ts#updateBoostPlan — admin-only input, but
  // a typo here still flows straight into a real Paystack charge.
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
    const column = PLAN_PATCH_COLUMNS[key];
    if (column) columns[column] = value;
  }
  if (Object.keys(columns).length === 0) {
    throw new ValidationError("No editable fields provided.");
  }
  columns.updated_at = new Date().toISOString();

  const db = getDb();
  const result = await db.from("ad_campaign_plans").update(columns).eq("id", id).select().single();
  const row = assertNoError(result, "updating ad campaign plan") as Row;
  return rowToAdCampaignPlan(row);
}

const HEADLINE_MAX = 60;
const BODY_MAX = 140;
const CTA_MAX = 24;

export function validateAdCampaignInput(input: { headline: string; body: string; ctaLabel: string }): void {
  if (!input.headline.trim()) {
    throw new ValidationError("A headline is required.");
  }
  if (input.headline.trim().length > HEADLINE_MAX) {
    throw new ValidationError(`Headline must be ${HEADLINE_MAX} characters or fewer.`);
  }
  if (!input.body.trim()) {
    throw new ValidationError("Supporting text is required.");
  }
  if (input.body.trim().length > BODY_MAX) {
    throw new ValidationError(`Supporting text must be ${BODY_MAX} characters or fewer.`);
  }
  if (!input.ctaLabel.trim()) {
    throw new ValidationError("A button label is required.");
  }
  if (input.ctaLabel.trim().length > CTA_MAX) {
    throw new ValidationError(`Button label must be ${CTA_MAX} characters or fewer.`);
  }
}

// Pure — the one rule for "is this campaign currently live." Same role as
// lib/boosts.ts#isBoostActive / lib/repo.ts#isBoostActive's sibling
// isSubscriptionLapsed: a single, reused definition rather than every
// caller re-deriving "ends_at in the future" its own way.
export function isCampaignActive(endsAt: string, now: number = Date.now()): boolean {
  return new Date(endsAt).getTime() > now;
}

// Every currently-active campaign — the eligible pool
// pickAdCampaignForImpression below draws from. Not what Home renders
// directly: showing all of them at once is the exact "10 advertisers
// fighting over one homepage card" problem the rotation system below
// exists to avoid. Deliberately a plain .gt query, not a fetch-all-then-
// filter-in-JS: there's no reason to ship rows that are already over.
export async function listActiveAdCampaigns(): Promise<AdCampaign[]> {
  const db = getDb();
  const result = await db
    .from("ad_campaigns")
    .select("*")
    .gt("ends_at", new Date().toISOString())
    .order("created_at", { ascending: true });
  const rows = assertNoError(result, "listing active ad campaigns") as Row[];
  return rows.map(rowToAdCampaign);
}

// The rotation engine, v1 — what Home's carousel actually calls. Picks ONE
// eligible campaign at random (uniform for now; a later slice can weight
// this by remaining budget/priority once those concepts exist) and counts
// showing it as a real impression, so exposure is spread across whatever's
// currently running instead of every buyer seeing every advertiser at
// once. Returns null when nothing is active — Home already handles "no
// campaign slide" today since it only ever had the static BANNERS before
// this feature existed at all.
export async function pickAdCampaignForImpression(): Promise<AdCampaign | null> {
  const active = await listActiveAdCampaigns();
  if (active.length === 0) return null;
  const picked = active[Math.floor(Math.random() * active.length)];

  const db = getDb();
  // Read-then-write, not a CAS retry loop — see migration 041's note: a
  // lost increment under a rare concurrent pick just slightly undercounts
  // a display metric, not a money field.
  const updateResult = await db.from("ad_campaigns").update({ impressions: picked.impressions + 1 }).eq("id", picked.id);
  assertNoError(updateResult, "recording an ad campaign impression");

  return { ...picked, impressions: picked.impressions + 1 };
}

// Called when a buyer actually taps a campaign slide — see
// app/api/ad-campaigns/[id]/click. Silently a no-op for an id that
// doesn't exist (a stale link, a double-tap after takedown) rather than
// throwing; a click landing a moment too late to matter isn't an error.
export async function recordAdCampaignClick(id: string): Promise<void> {
  const db = getDb();
  const result = await db.from("ad_campaigns").select("clicks").eq("id", id).maybeSingle();
  const row = assertNoError(result, "loading ad campaign for a click") as Row | null;
  if (!row) return;
  const updateResult = await db.from("ad_campaigns").update({ clicks: (row.clicks as number) + 1 }).eq("id", id);
  assertNoError(updateResult, "recording an ad campaign click");
}

export async function listAdCampaignsForSeller(sellerId: string): Promise<AdCampaign[]> {
  const db = getDb();
  const result = await db
    .from("ad_campaigns")
    .select("*")
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false });
  const rows = assertNoError(result, "listing this seller's ad campaigns") as Row[];
  return rows.map(rowToAdCampaign);
}

// Admin-only — every campaign, most recent first, for moderation.
export async function listAllAdCampaignsForAdmin(): Promise<AdCampaign[]> {
  const db = getDb();
  const result = await db.from("ad_campaigns").select("*").order("created_at", { ascending: false });
  const rows = assertNoError(result, "listing all ad campaigns") as Row[];
  return rows.map(rowToAdCampaign);
}

// The ONLY place a campaign is ever created — called from the Paystack
// webhook once the charge is confirmed, never on a client-supplied "I
// paid." Idempotent on paymentId (migration 040's partial unique index):
// a redelivered webhook event for the same charge must not create a
// second campaign, the same gap lib/boosts.ts#activateBoost closes for
// boosts via its own payment_id uniqueness.
const UNIQUE_VIOLATION = "23505";

export async function activateAdCampaign(input: {
  sellerId: string;
  planId: string;
  headline: string;
  body: string;
  ctaLabel: string;
  imageUrl: string;
  targetProductId: string | null;
  amount: number;
  paymentId: string;
}): Promise<void> {
  const db = getDb();
  const existingResult = await db.from("ad_campaigns").select("id").eq("payment_id", input.paymentId).maybeSingle();
  const existing = assertNoError(existingResult, "checking for an existing ad campaign") as Row | null;
  if (existing) return; // already activated for this exact payment

  const plan = await getAdCampaignPlan(input.planId);
  if (!plan) throw new Error(`activateAdCampaign: ad campaign plan ${input.planId} not found`);

  const endsAt = new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000);
  const id = "adcamp_" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase();

  const insertResult = await db.from("ad_campaigns").insert({
    id,
    seller_id: input.sellerId,
    plan_id: input.planId,
    headline: input.headline,
    body: input.body,
    cta_label: input.ctaLabel,
    image_url: input.imageUrl,
    target_product_id: input.targetProductId,
    amount: input.amount,
    payment_id: input.paymentId,
    ends_at: endsAt.toISOString(),
  });
  if (insertResult.error) {
    if (insertResult.error.code !== UNIQUE_VIOLATION) {
      throw new Error(`recording ad campaign: ${insertResult.error.message}`);
    }
    // Lost the claim to an overlapping call for the same payment — that
    // other call's insert is "the" campaign; nothing more to do here.
    return;
  }

  const seller = await findUserForSellerId(input.sellerId);
  if (seller) {
    await notifyBestEffort({
      userId: seller.id,
      type: "seller",
      title: "Your ad campaign is live",
      body: `"${input.headline}" is now showing in FindIt's home carousel, through ${endsAt.toLocaleDateString("en-NG", { day: "numeric", month: "short" })}.`,
    });
  }
}

// Called on a schedule (see app/api/cron/expirations) — same reasoning as
// lib/boosts.ts#notifyExpiredBoosts: nothing else would ever tell a seller
// who's stopped opening the app that their campaign ran out.
export async function notifyExpiredAdCampaigns(): Promise<number> {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const result = await db
    .from("ad_campaigns")
    .select("id, seller_id, headline, ends_at")
    .lte("ends_at", nowIso)
    .is("ended_notified_at", null);
  const rows = assertNoError(result, "finding ad campaigns that just ended") as Row[];

  let notified = 0;
  for (const row of rows) {
    // Conditioned on ends_at still matching exactly what was just read —
    // same race-safety reasoning as notifyExpiredBoosts: a fresh takedown
    // or a new campaign's own distinct row must never be mistaken for this
    // one already having been notified about.
    const claimResult = await db
      .from("ad_campaigns")
      .update({ ended_notified_at: nowIso })
      .eq("id", row.id as string)
      .eq("ends_at", row.ends_at as string)
      .select("id")
      .maybeSingle();
    const claimed = assertNoError(claimResult, "claiming ad campaign expiry notification") as Row | null;
    if (!claimed) continue;

    const seller = await findUserForSellerId(row.seller_id as string);
    if (!seller) continue;

    await notifyBestEffort({
      userId: seller.id,
      type: "seller",
      title: "Ad campaign ended",
      body: `Your campaign "${row.headline}" has finished running and is no longer showing on FindIt's home screen.`,
    });
    notified++;
  }
  return notified;
}

// Admin takedown — ends a campaign immediately regardless of its original
// ends_at, same trick isSubscriptionLapsed-style readers already rely on:
// every reader of this table only ever looks at ends_at, so moving it to
// now is enough to make the campaign stop appearing everywhere at once,
// with no second "is it taken down" flag for any of those readers to also
// check. taken_down_at/taken_down_reason are kept purely as an audit
// trail — see migration 040's note.
export async function takeDownAdCampaign(id: string, reason: string | null): Promise<AdCampaign | null> {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const result = await db
    .from("ad_campaigns")
    // ended_notified_at is set here too — a takedown already sends its own,
    // more specific notification below, so the expiry sweep
    // (notifyExpiredAdCampaigns) must not also fire its generic "ended"
    // one for the same campaign on its next run.
    .update({ ends_at: nowIso, taken_down_at: nowIso, taken_down_reason: reason, ended_notified_at: nowIso })
    .eq("id", id)
    .select()
    .maybeSingle();
  const row = assertNoError(result, "taking down ad campaign") as Row | null;
  if (!row) return null;

  const campaign = rowToAdCampaign(row);
  const seller = await findUserForSellerId(campaign.sellerId);
  if (seller) {
    await notifyBestEffort({
      userId: seller.id,
      type: "seller",
      title: "Your ad campaign was taken down",
      body: reason
        ? `"${campaign.headline}" was removed from FindIt's home carousel: ${reason}`
        : `"${campaign.headline}" was removed from FindIt's home carousel by an admin.`,
    });
  }
  return campaign;
}
