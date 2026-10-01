import { getDb, assertNoError } from "./db";
import { ValidationError, notifyBestEffort, findUserForSellerId } from "./repo";

type Row = Record<string, unknown>;

export type PlanKind = "store" | "platform";
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "cancelled" | "expired";
export type BillingPeriod = "monthly" | "yearly";

export type SubscriptionPlan = {
  id: string;
  kind: PlanKind;
  name: string;
  priceMonthly: number;
  priceYearly: number | null;
  // null = unlimited.
  productLimit: number | null;
  storageLimitMb: number | null;
  analyticsLevel: "none" | "basic" | "advanced" | "full";
  customizationLevel: "none" | "basic" | "advanced" | "full";
  featuredListingAccess: boolean;
  prioritySupport: boolean;
  proBadge: boolean;
  trialDays: number;
  sortOrder: number;
  active: boolean;
};

export type Subscription = {
  id: string;
  ownerType: "store" | "platform";
  ownerId: string;
  planId: string;
  status: SubscriptionStatus;
  billingPeriod: BillingPeriod;
  currentPeriodStart: string;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  createdAt: string;
};

export const FREE_STORE_PLAN_ID = "store_free";
const PERIOD_DAYS: Record<BillingPeriod, number> = { monthly: 30, yearly: 365 };

function randomId(prefix: string): string {
  return prefix + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase();
}

function rowToPlan(row: Row): SubscriptionPlan {
  return {
    id: row.id as string,
    kind: row.kind as PlanKind,
    name: row.name as string,
    priceMonthly: row.price_monthly as number,
    priceYearly: (row.price_yearly as number | null) ?? null,
    productLimit: (row.product_limit as number | null) ?? null,
    storageLimitMb: (row.storage_limit_mb as number | null) ?? null,
    analyticsLevel: row.analytics_level as SubscriptionPlan["analyticsLevel"],
    customizationLevel: row.customization_level as SubscriptionPlan["customizationLevel"],
    featuredListingAccess: Boolean(row.featured_listing_access),
    prioritySupport: Boolean(row.priority_support),
    proBadge: Boolean(row.pro_badge),
    trialDays: row.trial_days as number,
    sortOrder: row.sort_order as number,
    active: Boolean(row.active),
  };
}

function rowToSubscription(row: Row): Subscription {
  return {
    id: row.id as string,
    ownerType: row.owner_type as Subscription["ownerType"],
    ownerId: row.owner_id as string,
    planId: row.plan_id as string,
    status: row.status as SubscriptionStatus,
    billingPeriod: row.billing_period as BillingPeriod,
    currentPeriodStart: row.current_period_start as string,
    currentPeriodEnd: (row.current_period_end as string | null) ?? null,
    trialEndsAt: (row.trial_ends_at as string | null) ?? null,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    cancelledAt: (row.cancelled_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function listPlans(kind?: PlanKind): Promise<SubscriptionPlan[]> {
  const db = getDb();
  let query = db.from("subscription_plans").select("*").eq("active", true);
  if (kind) query = query.eq("kind", kind);
  const result = await query.order("sort_order", { ascending: true });
  const rows = assertNoError(result, "listing subscription plans") as Row[];
  return rows.map(rowToPlan);
}

export async function getPlan(id: string): Promise<SubscriptionPlan | null> {
  const db = getDb();
  const result = await db.from("subscription_plans").select("*").eq("id", id).maybeSingle();
  const row = assertNoError(result, "loading plan") as Row | null;
  return row ? rowToPlan(row) : null;
}

async function logEvent(subscriptionId: string, type: string, detail: Record<string, unknown> | null = null): Promise<void> {
  const db = getDb();
  const result = await db
    .from("subscription_events")
    .insert({ id: randomId("subev_"), subscription_id: subscriptionId, type, detail });
  assertNoError(result, "logging subscription event");
}

// The whole point of "downgrade without data loss": never delete a listing
// for exceeding the new plan's limit, just deactivate the newest ones over
// the line (oldest listings — the seller's longest-standing catalogue — stay
// live). Pure and unit-tested: given the caller decides what "active,
// oldest-first" means, this only decides which ids cross the line.
export function selectProductsToDeactivate(
  activeProducts: Array<{ id: string; createdAt: string }>,
  limit: number | null
): string[] {
  if (limit === null) return [];
  const sorted = [...activeProducts].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  return sorted.slice(limit).map((p) => p.id);
}

// "10 / 10 products used" / "128 products" (unlimited) — the exact display
// rule from the spec.
export function formatUsageLabel(count: number, limit: number | null): string {
  if (limit === null) return `${count} product${count === 1 ? "" : "s"}`;
  return `${count} / ${limit} products used`;
}

async function countActiveProducts(sellerId: string): Promise<number> {
  const db = getDb();
  const result = await db
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", sellerId)
    .eq("active", true);
  if (result.error) throw new Error(`counting active listings: ${result.error.message}`);
  return result.count ?? 0;
}

// Deactivates (never deletes) whichever of the seller's active listings are
// over `limit`, oldest-kept-active-first. Idempotent and safe to call any
// time a plan's effective limit tightens.
async function enforceProductLimit(sellerId: string, limit: number | null): Promise<number> {
  if (limit === null) return 0;
  const db = getDb();
  const result = await db
    .from("products")
    .select("id, created_at")
    .eq("seller_id", sellerId)
    .eq("active", true);
  const rows = assertNoError(result, "loading listings for plan-limit enforcement") as Row[];
  const toDeactivate = selectProductsToDeactivate(
    rows.map((r) => ({ id: r.id as string, createdAt: r.created_at as string })),
    limit
  );
  if (toDeactivate.length === 0) return 0;
  const updateResult = await db.from("products").update({ active: false }).in("id", toDeactivate);
  assertNoError(updateResult, "deactivating listings over the plan limit");
  return toDeactivate.length;
}

function periodEnd(period: BillingPeriod, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + PERIOD_DAYS[period]);
  return d.toISOString();
}

async function createSubscriptionRow(
  ownerType: "store" | "platform",
  ownerId: string,
  planId: string,
  options: { status?: SubscriptionStatus; billingPeriod?: BillingPeriod; currentPeriodEnd?: string | null; trialEndsAt?: string | null } = {}
): Promise<Subscription> {
  const db = getDb();
  const id = randomId("sub_");
  const status = options.status ?? "active";
  const insertResult = await db.from("subscriptions").insert({
    id,
    owner_type: ownerType,
    owner_id: ownerId,
    plan_id: planId,
    status,
    billing_period: options.billingPeriod ?? "monthly",
    current_period_start: new Date().toISOString(),
    current_period_end: options.currentPeriodEnd ?? null,
    trial_ends_at: options.trialEndsAt ?? null,
  });
  assertNoError(insertResult, "creating subscription");
  await logEvent(id, "created", { planId, status });
  const row = assertNoError(
    await db.from("subscriptions").select("*").eq("id", id).single(),
    "loading new subscription"
  ) as Row;
  return rowToSubscription(row);
}

// Every seller gets a Free Store subscription the moment they become a
// seller (signup as seller, or an existing buyer switching over) — so
// "current plan" is never a null/undefined case the rest of the app has to
// special-case. Idempotent: a second call for the same seller is a no-op.
export async function ensureDefaultStoreSubscription(sellerId: string): Promise<Subscription> {
  const existing = await getRawSubscription("store", sellerId);
  if (existing) return existing;
  return createSubscriptionRow("store", sellerId, FREE_STORE_PLAN_ID);
}

async function getRawSubscription(ownerType: "store" | "platform", ownerId: string): Promise<Subscription | null> {
  const db = getDb();
  const result = await db
    .from("subscriptions")
    .select("*")
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId)
    .maybeSingle();
  const row = assertNoError(result, "loading subscription") as Row | null;
  return row ? rowToSubscription(row) : null;
}

// Pure: has this subscription's paid-for period actually run out? This is
// the one check standing between "still Pro" and "quietly still showing Pro
// after it lapsed" — the exact trust failure a subscription system can't
// afford in either direction. Used both by the writing path below
// (resolveEffectiveSubscription, which then really moves the row to Free)
// and by the batched, read-only path (getStorePlanDisplayMap) that joins
// tier info onto every product listing without writing anything on a public
// read.
export function isSubscriptionLapsed(
  sub: { status: SubscriptionStatus; trialEndsAt: string | null; currentPeriodEnd: string | null },
  planPriceMonthly: number,
  now: number = Date.now()
): boolean {
  if (sub.status === "trialing" && sub.trialEndsAt && new Date(sub.trialEndsAt).getTime() <= now) {
    return true;
  }
  if (
    (sub.status === "active" || sub.status === "past_due") &&
    sub.currentPeriodEnd &&
    new Date(sub.currentPeriodEnd).getTime() <= now &&
    planPriceMonthly > 0
  ) {
    return true;
  }
  return false;
}

// Lazily expires a trial or an unpaid billing period back to Free — this app
// has no background job runner, so instead of a cron sweeping stale
// subscriptions, every read resolves the true current state at read time.
// Per spec: trial/period expiry never deletes the store or its listings,
// it only drops back to Free (which in turn re-enforces Free's limits). A
// platform (FindIt Pro) subscription has no "Free" plan to fall back to —
// see expirePlatformSubscription — so it's handled separately here rather
// than reusing downgradeToFree, which would otherwise reassign a lapsed
// FindIt Pro row to the store_free PLAN, a plan of the wrong kind entirely.
async function resolveEffectiveSubscription(sub: Subscription): Promise<Subscription> {
  const plan = await getPlan(sub.planId);
  if (!plan || !isSubscriptionLapsed(sub, plan.priceMonthly)) return sub;
  const reason = sub.status === "trialing" ? "trial_ended" : "expired";
  return sub.ownerType === "store" ? downgradeToFree(sub, reason) : expirePlatformSubscription(sub, reason);
}

// The platform-subscription equivalent of downgradeToFree: there's no Free
// FindIt Pro plan to fall back to, so a lapsed or cancelled subscription
// just moves to a terminal status (never deleted — same audit-trail
// philosophy as subscription_events) and getPlatformSubscription treats
// that status as "not currently Pro."
async function expirePlatformSubscription(sub: Subscription, reason: "trial_ended" | "expired" | "cancelled"): Promise<Subscription> {
  const db = getDb();
  // Conditioned on status still matching what the caller read (resolving a
  // lapse, or an explicit cancel) — this also runs from plain read paths
  // (resolveEffectiveSubscription, via getPlatformSubscription), so a lost
  // race here must not throw the way an explicit user action would; on a
  // miss, someone else already wrote this row since we read it, so re-read
  // and return their result instead of silently overwriting it.
  const updateResult = await db
    .from("subscriptions")
    .update({
      status: reason === "cancelled" ? "cancelled" : "expired",
      cancel_at_period_end: false,
      cancelled_at: reason === "cancelled" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sub.id)
    .eq("status", sub.status)
    .select()
    .maybeSingle();
  const row = assertNoError(updateResult, "expiring platform subscription") as Row | null;
  if (!row) {
    const latest = await getRawSubscription(sub.ownerType, sub.ownerId);
    if (!latest) throw new Error(`Subscription ${sub.id} disappeared mid-update`);
    return latest;
  }
  await logEvent(sub.id, reason, { fromPlanId: sub.planId, wasTrial: sub.status === "trialing" });
  // Only reaches here once, for whichever caller's write actually won the
  // race above (the condition on sub.status means a second call for an
  // already-expired row just takes the "re-read and return" branch instead
  // of landing here again) — so this fires exactly once per real lapse, no
  // matter whether it was a normal page load that happened to notice
  // (resolveEffectiveSubscription) or the scheduled sweep below catching a
  // seller who hasn't opened the app since. Never for "cancelled" — that's
  // the seller's own action, moments old; they don't need telling.
  if (reason !== "cancelled") {
    await notifyBestEffort({
      userId: sub.ownerId,
      type: "seller",
      title: reason === "trial_ended" ? "Your FindIt Pro trial has ended" : "Your FindIt Pro subscription expired",
      body: "Your FindIt Pro perks have been turned off — resubscribe anytime to get them back.",
    });
  }
  return rowToSubscription(row);
}

async function downgradeToFree(sub: Subscription, reason: "trial_ended" | "expired" | "cancelled"): Promise<Subscription> {
  const db = getDb();
  // Same conditioned-write reasoning as expirePlatformSubscription above:
  // this also runs from plain read paths (resolveEffectiveSubscription via
  // getSellerSubscription), so a lost race re-reads and returns the other
  // writer's result instead of throwing or silently overwriting it — e.g.
  // a lapse-driven downgrade must not stomp an upgrade a webhook just
  // applied to this same row moments earlier.
  const updateResult = await db
    .from("subscriptions")
    .update({
      plan_id: FREE_STORE_PLAN_ID,
      status: "active",
      billing_period: "monthly",
      current_period_start: new Date().toISOString(),
      current_period_end: null,
      trial_ends_at: null,
      cancel_at_period_end: false,
      cancelled_at: reason === "cancelled" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sub.id)
    .eq("plan_id", sub.planId)
    .eq("status", sub.status)
    .select()
    .maybeSingle();
  const row = assertNoError(updateResult, "reverting subscription to Free") as Row | null;
  if (!row) {
    const latest = await getRawSubscription(sub.ownerType, sub.ownerId);
    if (!latest) throw new Error(`Subscription ${sub.id} disappeared mid-update`);
    return latest;
  }
  await logEvent(sub.id, reason, { fromPlanId: sub.planId, wasTrial: sub.status === "trialing" });
  if (sub.ownerType === "store") {
    const freePlan = await getPlan(FREE_STORE_PLAN_ID);
    await enforceProductLimit(sub.ownerId, freePlan?.productLimit ?? null);
  }
  // Same "fires exactly once per real lapse" reasoning as
  // expirePlatformSubscription above. sub.ownerId here is a sellers.id, not
  // a users.id (see getSellerIdForUser) — needs the same resolution every
  // other seller-facing notification in this codebase already does.
  if (reason !== "cancelled") {
    const seller = await findUserForSellerId(sub.ownerId);
    if (seller) {
      await notifyBestEffort({
        userId: seller.id,
        type: "seller",
        title: reason === "trial_ended" ? "Your store trial has ended" : "Your store subscription expired",
        body: "Your store is back on the Free plan — upgrade anytime to get your plan's perks back.",
      });
    }
  }
  return rowToSubscription(row);
}

// Called on a schedule (see app/api/cron/expirations, vercel.json) rather
// than waiting for a read that happens to trigger resolveEffectiveSubscription
// (getSellerSubscription/getPlatformSubscription) to lazily notice a lapse.
// That lazy path works fine for a seller who's still opening the app, but
// someone who stops entirely — the exact seller a "your trial ended"
// notification matters most for — would otherwise never have their row
// re-read at all, and so never get told. Safe to run concurrently with a
// normal lazy read of the same row: both go through the same
// conditioned update inside downgradeToFree/expirePlatformSubscription, so
// whichever gets there first is the one that actually writes (and
// notifies) — the other just takes the "someone else already handled this"
// branch.
export async function sweepLapsedSubscriptions(): Promise<number> {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const result = await db
    .from("subscriptions")
    .select("*")
    .in("status", ["active", "trialing", "past_due"])
    .or(`current_period_end.lte.${nowIso},trial_ends_at.lte.${nowIso}`);
  const rows = assertNoError(result, "finding subscriptions to sweep for expiry") as Row[];

  let resolved = 0;
  for (const row of rows) {
    const sub = rowToSubscription(row);
    const after = await resolveEffectiveSubscription(sub);
    if (after.status !== sub.status) resolved++;
  }
  return resolved;
}

// The main read path — used by gating checks and the dashboard alike, so
// nothing else in the app ever reads a stale/expired subscription row
// directly.
export async function getSellerSubscription(sellerId: string): Promise<{ subscription: Subscription; plan: SubscriptionPlan }> {
  let sub = await getRawSubscription("store", sellerId);
  if (!sub) sub = await ensureDefaultStoreSubscription(sellerId);
  sub = await resolveEffectiveSubscription(sub);
  const plan = await getPlan(sub.planId);
  if (!plan) throw new Error(`Subscription ${sub.id} references missing plan ${sub.planId}`);
  return { subscription: sub, plan };
}

// Returns null both when the account has never subscribed AND when a past
// subscription has lapsed or been cancelled — "not currently Pro" either
// way. The row itself is never deleted (see expirePlatformSubscription), so
// re-subscribing later updates this same row rather than creating a second
// one, which the unique(owner_type, owner_id) constraint wouldn't allow.
export async function getPlatformSubscription(userId: string): Promise<{ subscription: Subscription; plan: SubscriptionPlan } | null> {
  let sub = await getRawSubscription("platform", userId);
  if (!sub) return null;
  sub = await resolveEffectiveSubscription(sub);
  if (sub.status === "expired" || sub.status === "cancelled") return null;
  const plan = await getPlan(sub.planId);
  if (!plan) return null;
  return { subscription: sub, plan };
}

// Everything the FindIt Pro screen needs: whether this account currently has
// it, and the (currently singular) platform plan available to subscribe to.
export async function getPlatformPlanOverview(userId: string): Promise<{
  subscription: Subscription | null;
  plan: SubscriptionPlan | null;
  plans: SubscriptionPlan[];
}> {
  const [current, plans] = await Promise.all([getPlatformSubscription(userId), listPlans("platform")]);
  return { subscription: current?.subscription ?? null, plan: current?.plan ?? null, plans };
}

// Pure — unit-testable without a database. A 'cancelled' event only counts
// as "already used this plan's trial" when the subscription was still
// trialing at the moment it was cancelled (see downgradeToFree/
// expirePlatformSubscription's `wasTrial` detail) — cancelling out of a
// fully-paid period never should. Without this distinction, cancel-then-
// resubscribe granted a fresh trial every time: cancelStoreSubscription
// used to always log "cancelled", never "trial_ended", so
// hasUsedTrialBefore's old `type === 'trial_ended'`-only check never saw a
// trial someone cut short instead of letting lapse naturally.
export function hasConsumedTrial(events: { type: string; detail: Record<string, unknown> | null }[], planId: string): boolean {
  return events.some((e) => {
    if (e.detail?.fromPlanId !== planId) return false;
    if (e.type === "trial_ended") return true;
    return e.type === "cancelled" && e.detail?.wasTrial === true;
  });
}

async function hasUsedPlatformTrialBefore(userId: string, planId: string): Promise<boolean> {
  const sub = await getRawSubscription("platform", userId);
  if (!sub) return false;
  const db = getDb();
  const result = await db
    .from("subscription_events")
    .select("type, detail")
    .eq("subscription_id", sub.id)
    .in("type", ["trial_ended", "cancelled"]);
  if (result.error) return false; // fail open toward "allow a trial" — never blocks a legitimate first trial
  return hasConsumedTrial((result.data ?? []) as { type: string; detail: Record<string, unknown> | null }[], planId);
}

// Same shape as previewStorePlanChange, for the one purchasable platform
// plan (FindIt Pro) today — kept generic (by planId) so an admin adding a
// second platform-kind plan later doesn't need this rewritten.
export async function previewPlatformPlanChange(
  userId: string,
  newPlanId: string,
  billingPeriod: BillingPeriod
): Promise<PlanChangePreview> {
  const [current, newPlan] = await Promise.all([getPlatformSubscription(userId), getPlan(newPlanId)]);
  if (!newPlan || newPlan.kind !== "platform" || !newPlan.active) {
    throw new ValidationError("That plan isn't available.");
  }
  if (current && current.subscription.planId === newPlan.id && current.subscription.billingPeriod === billingPeriod) {
    return { outcome: "noop" };
  }
  if (newPlan.priceMonthly === 0) return { outcome: "free" };
  if (newPlan.trialDays > 0 && !(await hasUsedPlatformTrialBefore(userId, newPlan.id))) {
    return { outcome: "trial", trialDays: newPlan.trialDays };
  }
  const amount = billingPeriod === "yearly" ? newPlan.priceYearly ?? newPlan.priceMonthly * 12 : newPlan.priceMonthly;
  return { outcome: "payment_required", amount };
}

// Applies a platform-plan subscribe/renew that previewPlatformPlanChange
// already determined is free or trial-eligible, OR a paid subscription once
// options.paymentConfirmed is true (only ever set by the Paystack webhook —
// never trust a client-supplied "I paid"). Unlike changeStorePlan there's no
// product-limit enforcement here: a platform subscription doesn't gate
// listings.
export async function changePlatformSubscription(
  userId: string,
  newPlanId: string,
  billingPeriod: BillingPeriod,
  options: { paymentConfirmed?: boolean } = {}
): Promise<Subscription> {
  const [current, newPlan] = await Promise.all([getPlatformSubscription(userId), getPlan(newPlanId)]);
  if (!newPlan || newPlan.kind !== "platform" || !newPlan.active) {
    throw new ValidationError("That plan isn't available.");
  }
  if (current && current.subscription.planId === newPlan.id && current.subscription.billingPeriod === billingPeriod) {
    throw new ValidationError(`You're already subscribed to ${newPlan.name}.`);
  }

  const isFree = newPlan.priceMonthly === 0;
  const price = billingPeriod === "yearly" ? newPlan.priceYearly ?? newPlan.priceMonthly * 12 : newPlan.priceMonthly;

  let status: SubscriptionStatus = "active";
  let trialEndsAt: string | null = null;
  let currentPeriodEnd: string | null = null;

  if (isFree) {
    status = "active";
  } else if (options.paymentConfirmed) {
    status = "active";
    currentPeriodEnd = periodEnd(billingPeriod);
  } else if (newPlan.trialDays > 0 && !(await hasUsedPlatformTrialBefore(userId, newPlan.id))) {
    status = "trialing";
    trialEndsAt = new Date(Date.now() + newPlan.trialDays * 24 * 60 * 60 * 1000).toISOString();
  } else {
    throw new ValidationError(
      `${newPlan.name} requires payment — pay ₦${price.toLocaleString("en-NG")} to activate it.`
    );
  }

  const db = getDb();
  // subscriptions has unique(owner_type, owner_id) and expirePlatformSubscription
  // never deletes the row, so a returning subscriber always hits the update
  // path below, not a second insert.
  const existingRaw = await getRawSubscription("platform", userId);
  if (existingRaw) {
    // Conditioned on plan_id/status still matching exactly what this call
    // just read — not just the row id. Without this, the Paystack webhook
    // confirming a paid upgrade and a concurrent cancel/another change both
    // read the same pre-write row and race: whichever write lands second
    // silently overwrites the other with no error, no refund, nothing —
    // e.g. a just-charged upgrade getting clobbered back to a prior plan.
    // Same pattern as confirmDelivery/reportOrderIssue in lib/repo.ts.
    const updateResult = await db
      .from("subscriptions")
      .update({
        plan_id: newPlan.id,
        status,
        billing_period: billingPeriod,
        current_period_start: new Date().toISOString(),
        current_period_end: currentPeriodEnd,
        trial_ends_at: trialEndsAt,
        cancel_at_period_end: false,
        cancelled_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingRaw.id)
      .eq("plan_id", existingRaw.planId)
      .eq("status", existingRaw.status)
      .select()
      .maybeSingle();
    const row = assertNoError(updateResult, "changing platform subscription") as Row | null;
    if (!row) {
      throw new ValidationError("Your subscription just changed — refresh and try again.");
    }
    await logEvent(existingRaw.id, "renewed", { planId: newPlan.id, status });
    return rowToSubscription(row);
  }
  return createSubscriptionRow("platform", userId, newPlan.id, { status, billingPeriod, currentPeriodEnd, trialEndsAt });
}

// Cancelling takes effect immediately, same reasoning as
// cancelStoreSubscription: no scheduled job exists here to expire it "at
// period end" later, so an immediate, honest cancel is the truthful option.
export async function cancelPlatformSubscription(userId: string): Promise<Subscription> {
  const current = await getPlatformSubscription(userId);
  if (!current) {
    throw new ValidationError("You don't have an active FindIt Pro subscription.");
  }
  return expirePlatformSubscription(current.subscription, "cancelled");
}

// Admin-only escape hatch, same pattern as grantStorePlan — a user who paid
// off-platform, or testing the subscribe flow with no live Paystack keys.
export async function grantPlatformSubscription(userId: string, planId: string, billingPeriod: BillingPeriod): Promise<Subscription> {
  return changePlatformSubscription(userId, planId, billingPeriod, { paymentConfirmed: true });
}

// Everything a seller needs to see on their dashboard's "Store plan" card
// and the plan-comparison screen: current plan, usage against its limit, and
// every plan they could move to.
export async function getStorePlanOverview(sellerId: string) {
  const [{ subscription, plan }, plans, activeCount] = await Promise.all([
    getSellerSubscription(sellerId),
    listPlans("store"),
    countActiveProducts(sellerId),
  ]);
  return {
    subscription,
    plan,
    usage: { activeProducts: activeCount, label: formatUsageLabel(activeCount, plan.productLimit) },
    plans,
    // The dashboard's storefront-template picker reads this directly off
    // the same "everything my Store plan screen needs" call it already
    // makes — see storeTemplatesForLevel above for why each entry carries
    // its own `locked` flag rather than this just being the unlocked subset.
    storeTemplates: storeTemplatesForLevel(plan.customizationLevel),
  };
}

export type StorePlanDisplay = {
  planId: string;
  planName: string;
  proBadge: boolean;
  featuredListingAccess: boolean;
  customizationLevel: SubscriptionPlan["customizationLevel"];
};

const DEFAULT_DISPLAY: StorePlanDisplay = {
  planId: FREE_STORE_PLAN_ID,
  planName: "Free Seller",
  proBadge: false,
  featuredListingAccess: false,
  customizationLevel: "none",
};

// One batched, READ-ONLY pass over every seller's subscription — used to
// join tier info (Pro badge, featured placement, branding permission) onto
// every product row at listing time. Deliberately does not write anything:
// listProducts() runs on every public page load, and lazily "fixing" every
// lapsed trial/period on every one of those reads would turn a catalogue
// browse into a burst of subscription writes. The one-row writing path
// (getSellerSubscription -> resolveEffectiveSubscription) still runs
// whenever that specific seller's own subscription is read, which is what
// actually flips the row to Free — this only ever affects what buyers see
// in the meantime, never what's stored, and it can only ever show a lapsed
// seller as Free (undercrediting), never show an active seller as anything
// but their real plan.
export async function getStorePlanDisplayMap(): Promise<Map<string, StorePlanDisplay>> {
  const db = getDb();
  const [subsResult, plans] = await Promise.all([
    db.from("subscriptions").select("*").eq("owner_type", "store"),
    listAllPlansForAdmin(),
  ]);
  const subs = assertNoError(subsResult, "loading store subscriptions") as Row[];
  const planById = new Map(plans.map((p) => [p.id, p]));
  const now = Date.now();

  const map = new Map<string, StorePlanDisplay>();
  for (const row of subs) {
    const sub = rowToSubscription(row);
    const plan = planById.get(sub.planId);
    if (!plan) continue;
    const display = isSubscriptionLapsed(sub, plan.priceMonthly, now)
      ? DEFAULT_DISPLAY
      : {
          planId: plan.id,
          planName: plan.name,
          proBadge: plan.proBadge,
          featuredListingAccess: plan.featuredListingAccess,
          customizationLevel: plan.customizationLevel,
        };
    map.set(sub.ownerId, display);
  }
  return map;
}

// Throws a ValidationError naming the plan a seller would need, rather than
// a bare "limit reached" — the upgrade-experience requirement from the spec.
// Called before a listing is created or reactivated so the limit is real,
// server-enforced, not just a hidden button.
export async function assertCanActivateProduct(sellerId: string): Promise<void> {
  const { plan, usage } = await getStorePlanOverview(sellerId);
  if (plan.productLimit !== null && usage.activeProducts >= plan.productLimit) {
    const plans = await listPlans("store");
    const next = plans.find((p) => p.sortOrder > plan.sortOrder && (p.productLimit === null || p.productLimit > plan.productLimit!));
    const suggestion = next ? ` Upgrade to ${next.name} for ${next.productLimit === null ? "unlimited" : next.productLimit} active products.` : "";
    throw new ValidationError(
      `You've reached the ${plan.name} plan's limit of ${plan.productLimit} active products.${suggestion}`
    );
  }
}

// Same pattern as assertCanActivateProduct — real server-side gate, not a
// hidden button. A seller on Free/Basic (customization_level "none") who
// PATCHes /api/sellers/me/branding directly gets rejected here, not just
// hidden from in the UI.
export async function assertCanCustomizeStore(sellerId: string): Promise<void> {
  const { plan } = await getSellerSubscription(sellerId);
  if (plan.customizationLevel === "none") {
    const plans = await listPlans("store");
    const next = plans.find((p) => p.sortOrder > plan.sortOrder && p.customizationLevel !== "none");
    const suggestion = next ? ` Available on ${next.name} and above.` : "";
    throw new ValidationError(`Store branding isn't available on the ${plan.name} plan.${suggestion}`);
  }
}

/* -------------------------------------------------------------------------- */
/*  Storefront layout templates (migration 031)                               */
/*                                                                            */
/*  customizationLevel has always had four named tiers (none/basic/advanced/ */
/*  full), but until now every tier above "none" unlocked the exact same    */
/*  thing (a logo/banner upload) — the tiers themselves did nothing. This    */
/*  catalog is what finally makes basic/advanced/full mean something        */
/*  different from each other: which storefront LAYOUTS a seller can pick.  */
/* -------------------------------------------------------------------------- */

export type StoreTemplateId = "classic" | "compact" | "gallery" | "showcase";

export type StoreTemplate = {
  id: StoreTemplateId;
  name: string;
  description: string;
  minCustomizationLevel: SubscriptionPlan["customizationLevel"];
};

// Ordered so a plain array `.find`/comparison by index would already work,
// but kept explicit (a rank map) rather than relying on array order, so
// reordering STORE_TEMPLATES below can never silently change who unlocks
// what.
const CUSTOMIZATION_LEVEL_RANK: Record<SubscriptionPlan["customizationLevel"], number> = {
  none: 0,
  basic: 1,
  advanced: 2,
  full: 3,
};

// 'classic' is deliberately the ONE template every plan (including Free)
// can render — it's the layout that already existed before this feature,
// not a new design. The other three are real, structurally different
// layouts (see app/store/[slug]/StoreTemplate.tsx), not just recolors.
export const STORE_TEMPLATES: StoreTemplate[] = [
  {
    id: "classic",
    name: "Classic",
    description: "The standard FindIt storefront — banner, logo, and a clean product grid.",
    minCustomizationLevel: "none",
  },
  {
    id: "compact",
    name: "Compact",
    description: "A tighter layout that gets buyers to your products faster, with less scrolling.",
    minCustomizationLevel: "basic",
  },
  {
    id: "gallery",
    name: "Gallery",
    description: "Product-forward — a larger, image-led grid takes center stage right under your header.",
    minCustomizationLevel: "advanced",
  },
  {
    id: "showcase",
    name: "Showcase",
    description: "An editorial, premium layout with a full-width banner and a featured About section.",
    minCustomizationLevel: "full",
  },
];

export const DEFAULT_STORE_TEMPLATE: StoreTemplateId = "classic";

export function isStoreTemplateId(value: string): value is StoreTemplateId {
  return STORE_TEMPLATES.some((t) => t.id === value);
}

function templateRequiredRank(id: StoreTemplateId): number {
  // STORE_TEMPLATES always has an entry for every StoreTemplateId (the type
  // is derived from it), so this lookup cannot miss.
  return CUSTOMIZATION_LEVEL_RANK[STORE_TEMPLATES.find((t) => t.id === id)!.minCustomizationLevel];
}

// Pure — the one rule for "does this plan level actually unlock this
// template." Used both to gate the WRITE (assertCanUseStoreTemplate below)
// and to decide what the PUBLIC store page renders for a seller whose plan
// has since lapsed (see lib/sellerPublicProfile.ts) — same "never trust a
// stored value past what the live plan currently allows" rule
// getStorePlanDisplayMap/isSubscriptionLapsed already apply to the Pro
// badge and featured placement above.
export function isTemplateUnlockedAtLevel(id: StoreTemplateId, level: SubscriptionPlan["customizationLevel"]): boolean {
  return CUSTOMIZATION_LEVEL_RANK[level] >= templateRequiredRank(id);
}

// What the PUBLIC store page should actually render. Falls back to the
// universal default rather than ever rendering a template the seller's
// CURRENT plan doesn't unlock, even when that's what's stored on their row
// — e.g. they picked Showcase on Pro, then their subscription lapsed back
// to Free. An unrecognized stored value (should never happen, but this is
// a plain text column with no DB-level enum) falls back the same way.
export function effectiveStoreTemplate(stored: string | null, level: SubscriptionPlan["customizationLevel"]): StoreTemplateId {
  if (stored && isStoreTemplateId(stored) && isTemplateUnlockedAtLevel(stored, level)) return stored;
  return DEFAULT_STORE_TEMPLATE;
}

// What the seller's OWN dashboard shows as choices — the full catalog,
// each annotated with whether their CURRENT plan actually unlocks it. A
// locked template is shown (with what it needs), never silently hidden —
// the same "show the locked state, don't hide it" pattern StorePlans.jsx
// and BrandingCard already use for every other plan-gated feature.
export function storeTemplatesForLevel(
  level: SubscriptionPlan["customizationLevel"]
): Array<StoreTemplate & { locked: boolean }> {
  return STORE_TEMPLATES.map((t) => ({ ...t, locked: !isTemplateUnlockedAtLevel(t.id, level) }));
}

// Real server-side gate for the WRITE, same spirit as assertCanCustomizeStore
// above but specific to which template was asked for, not just "any
// customization at all" — a Basic seller sending "showcase" directly to the
// API must be rejected here even though they pass assertCanCustomizeStore.
export async function assertCanUseStoreTemplate(sellerId: string, templateId: string): Promise<void> {
  if (!isStoreTemplateId(templateId)) {
    throw new ValidationError("Unknown store template.");
  }
  const { plan } = await getSellerSubscription(sellerId);
  if (!isTemplateUnlockedAtLevel(templateId, plan.customizationLevel)) {
    const template = STORE_TEMPLATES.find((t) => t.id === templateId)!;
    const requiredRank = templateRequiredRank(templateId);
    const plans = await listPlans("store");
    const next = plans.find((p) => CUSTOMIZATION_LEVEL_RANK[p.customizationLevel] >= requiredRank);
    const suggestion = next ? ` Available on ${next.name} and above.` : "";
    throw new ValidationError(`The "${template.name}" template isn't available on the ${plan.name} plan.${suggestion}`);
  }
}

export type PlanChangePreview =
  | { outcome: "noop" }
  | { outcome: "free" }
  | { outcome: "trial"; trialDays: number }
  | { outcome: "payment_required"; amount: number };

// Decides what WOULD happen for a plan change, without writing anything —
// lets the checkout route branch (apply directly vs. start a real Paystack
// transaction) without relying on catching changeStorePlan's errors for
// control flow, which would also swallow a genuine "already on this plan"
// error under the same catch.
export async function previewStorePlanChange(
  sellerId: string,
  newPlanId: string,
  billingPeriod: BillingPeriod
): Promise<PlanChangePreview> {
  const [{ subscription: current }, newPlan] = await Promise.all([
    getSellerSubscription(sellerId),
    getPlan(newPlanId),
  ]);
  if (!newPlan || newPlan.kind !== "store" || !newPlan.active) {
    throw new ValidationError("That plan isn't available.");
  }
  if (newPlan.id === current.planId && current.billingPeriod === billingPeriod) {
    return { outcome: "noop" };
  }
  if (newPlan.priceMonthly === 0) return { outcome: "free" };
  if (newPlan.trialDays > 0 && !(await hasUsedTrialBefore(sellerId, newPlan.id))) {
    return { outcome: "trial", trialDays: newPlan.trialDays };
  }
  const amount = billingPeriod === "yearly" ? newPlan.priceYearly ?? newPlan.priceMonthly * 12 : newPlan.priceMonthly;
  return { outcome: "payment_required", amount };
}

// Applies a plan change that previewStorePlanChange already determined is
// either free or a trial-eligible upgrade (outcome !== "payment_required"),
// OR applies a paid plan once options.paymentConfirmed is true (only ever
// set by app/api/payments/paystack/webhook after Paystack confirms the
// charge — never trust a client-supplied "I paid").
export async function changeStorePlan(
  sellerId: string,
  newPlanId: string,
  billingPeriod: BillingPeriod,
  options: { paymentConfirmed?: boolean } = {}
): Promise<Subscription> {
  const [{ subscription: current, plan: currentPlan }, newPlan] = await Promise.all([
    getSellerSubscription(sellerId),
    getPlan(newPlanId),
  ]);
  if (!newPlan || newPlan.kind !== "store" || !newPlan.active) {
    throw new ValidationError("That plan isn't available.");
  }
  if (newPlan.id === current.planId && current.billingPeriod === billingPeriod) {
    throw new ValidationError(`You're already on ${newPlan.name}.`);
  }

  const db = getDb();
  const isFree = newPlan.priceMonthly === 0;
  const price = billingPeriod === "yearly" ? newPlan.priceYearly ?? newPlan.priceMonthly * 12 : newPlan.priceMonthly;

  let status: SubscriptionStatus = "active";
  let trialEndsAt: string | null = null;
  let currentPeriodEnd: string | null = null;

  if (isFree) {
    status = "active";
  } else if (options.paymentConfirmed) {
    status = "active";
    currentPeriodEnd = periodEnd(billingPeriod);
  } else if (newPlan.trialDays > 0 && !(await hasUsedTrialBefore(sellerId, newPlan.id))) {
    status = "trialing";
    trialEndsAt = new Date(Date.now() + newPlan.trialDays * 24 * 60 * 60 * 1000).toISOString();
  } else {
    throw new ValidationError(
      `${newPlan.name} requires payment — pay ₦${price.toLocaleString("en-NG")} to activate it.`
    );
  }

  // Conditioned on plan_id/status still matching what this call just read —
  // not just the row id. Without this, a paid upgrade confirmed by the
  // Paystack webhook and a concurrent cancel/plan change (a retried client
  // action, a double-submit) both read the same pre-write row, and
  // whichever write lands second silently overwrites the other: a seller's
  // just-charged upgrade could get clobbered back to a prior plan with no
  // error and no refund triggered. Same pattern as confirmDelivery/
  // reportOrderIssue in lib/repo.ts.
  const updateResult = await db
    .from("subscriptions")
    .update({
      plan_id: newPlan.id,
      status,
      billing_period: billingPeriod,
      current_period_start: new Date().toISOString(),
      current_period_end: currentPeriodEnd,
      trial_ends_at: trialEndsAt,
      cancel_at_period_end: false,
      cancelled_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", current.id)
    .eq("plan_id", current.planId)
    .eq("status", current.status)
    .select()
    .maybeSingle();
  const row = assertNoError(updateResult, "changing store plan") as Row | null;
  if (!row) {
    throw new ValidationError("Your store's subscription just changed — refresh and try again.");
  }

  const direction = newPlan.sortOrder > currentPlan.sortOrder ? "upgraded" : newPlan.sortOrder < currentPlan.sortOrder ? "downgraded" : "changed";
  await logEvent(current.id, direction, { fromPlanId: currentPlan.id, toPlanId: newPlan.id, status });

  // The downgrade-without-data-loss promise: deactivate (never delete)
  // whatever no longer fits, oldest listings kept active.
  if (newPlan.productLimit !== null && (currentPlan.productLimit === null || newPlan.productLimit < currentPlan.productLimit)) {
    await enforceProductLimit(sellerId, newPlan.productLimit);
  }

  return rowToSubscription(row);
}

async function hasUsedTrialBefore(sellerId: string, planId: string): Promise<boolean> {
  const { subscription } = await getSellerSubscription(sellerId);
  const db = getDb();
  const result = await db
    .from("subscription_events")
    .select("type, detail")
    .eq("subscription_id", subscription.id)
    .in("type", ["trial_ended", "cancelled"]);
  if (result.error) return false; // fail open toward "allow a trial" — never blocks a legitimate first trial
  return hasConsumedTrial((result.data ?? []) as { type: string; detail: Record<string, unknown> | null }[], planId);
}

// Cancelling takes effect immediately (drops straight to Free) rather than
// "at period end" — this app has no scheduled job runner to expire it
// later, and Free never deletes data, so there's no harm in an immediate,
// honest cancel instead of a promise this codebase can't keep on its own.
export async function cancelStoreSubscription(sellerId: string): Promise<Subscription> {
  const { subscription, plan } = await getSellerSubscription(sellerId);
  if (plan.id === FREE_STORE_PLAN_ID) {
    throw new ValidationError("You're already on the Free plan.");
  }
  return downgradeToFree(subscription, "cancelled");
}

// Admin-only. All plan config an admin can edit without a deploy — the
// spec's "I don't want to modify frontend code every time we change ₦2,000
// to ₦2,500." Includes inactive plans (the seller-facing listPlans() above
// deliberately excludes those).
export async function listAllPlansForAdmin(): Promise<SubscriptionPlan[]> {
  const db = getDb();
  const result = await db.from("subscription_plans").select("*").order("kind").order("sort_order");
  const rows = assertNoError(result, "listing all subscription plans") as Row[];
  return rows.map(rowToPlan);
}

const PLAN_PATCH_COLUMNS: Record<string, string> = {
  name: "name",
  priceMonthly: "price_monthly",
  priceYearly: "price_yearly",
  productLimit: "product_limit",
  storageLimitMb: "storage_limit_mb",
  analyticsLevel: "analytics_level",
  customizationLevel: "customization_level",
  featuredListingAccess: "featured_listing_access",
  prioritySupport: "priority_support",
  proBadge: "pro_badge",
  trialDays: "trial_days",
  sortOrder: "sort_order",
  active: "active",
};

export async function updatePlan(
  id: string,
  patch: Partial<Omit<SubscriptionPlan, "id" | "kind">>
): Promise<SubscriptionPlan> {
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
  const result = await db.from("subscription_plans").update(columns).eq("id", id).select().single();
  const row = assertNoError(result, "updating plan") as Row;
  return rowToPlan(row);
}

// Admin manually activates a paid plan for a seller — the escape hatch for
// "seller paid off-platform (bank transfer) before Paystack was live" and
// for testing the upgrade flow in an environment with no Paystack keys.
// Bypasses trial eligibility and payment entirely; always logged via
// lib/repo.ts#logAdminAction by the caller (see the admin route), same as
// every other high-impact admin action in this app.
export async function grantStorePlan(sellerId: string, planId: string, billingPeriod: BillingPeriod): Promise<Subscription> {
  return changeStorePlan(sellerId, planId, billingPeriod, { paymentConfirmed: true });
}

export async function markSubscriptionPastDue(subscriptionId: string): Promise<void> {
  const db = getDb();
  const result = await db.from("subscriptions").update({ status: "past_due", updated_at: new Date().toISOString() }).eq("id", subscriptionId);
  assertNoError(result, "marking subscription past due");
  await logEvent(subscriptionId, "payment_failed");
}

// Real counts for the admin overview — what plan every store and platform
// subscription is actually on right now. See getRevenueOverview below for
// MRR/churn.
export async function getSubscriptionOverviewCounts(): Promise<{
  paidStoreSubscriptions: number;
  freeStoreSubscriptions: number;
  activePlatformSubscriptions: number;
}> {
  const db = getDb();
  const activeStatuses = ["active", "trialing"];
  const [paidResult, freeResult, platformResult] = await Promise.all([
    db.from("subscriptions").select("id", { count: "exact", head: true })
      .eq("owner_type", "store").neq("plan_id", FREE_STORE_PLAN_ID).in("status", activeStatuses),
    db.from("subscriptions").select("id", { count: "exact", head: true })
      .eq("owner_type", "store").eq("plan_id", FREE_STORE_PLAN_ID),
    db.from("subscriptions").select("id", { count: "exact", head: true })
      .eq("owner_type", "platform").in("status", activeStatuses),
  ]);
  if (paidResult.error) throw new Error(`counting paid store subscriptions: ${paidResult.error.message}`);
  if (freeResult.error) throw new Error(`counting free store subscriptions: ${freeResult.error.message}`);
  if (platformResult.error) throw new Error(`counting platform subscriptions: ${platformResult.error.message}`);
  return {
    paidStoreSubscriptions: paidResult.count ?? 0,
    freeStoreSubscriptions: freeResult.count ?? 0,
    activePlatformSubscriptions: platformResult.count ?? 0,
  };
}

// Pure: one subscription's contribution to MRR, normalized to a monthly
// figure regardless of billing period. A yearly subscriber's ₦35,000 counts
// as ~₦2,917/mo here, the same way any standard MRR definition treats
// annual billing — never the full ₦35,000 landing in a single month.
export function normalizedMonthlyRevenue(
  plan: { priceMonthly: number; priceYearly: number | null },
  billingPeriod: BillingPeriod
): number {
  if (billingPeriod === "yearly") {
    return (plan.priceYearly ?? plan.priceMonthly * 12) / 12;
  }
  return plan.priceMonthly;
}

// MRR here is "current run-rate": today's active/trialing paid subscribers
// at their CURRENT plan price — the standard, forward-looking MRR
// definition, not a sum of historical payments actually collected (which
// this app also has, in `payments`, but that undercounts a plan whose price
// just changed and overcounts a lapsed yearly subscriber's up-front
// payment). An admin editing a plan's price updates MRR on the very next
// read, same as every other "live plan" read in this file.
//
// Churn is reported as two plain counts over a trailing 30 days —
// cancellations (buyer-initiated) and expirations (an unpaid period simply
// lapsed) — rather than a percentage rate. A rate needs a cohort baseline
// ("how many paying subscribers existed 30 days ago") this app has never
// snapshotted, so computing one would fabricate precision the data doesn't
// support; a real count from subscription_events does not. Both trial_ended
// events and cancellations/expirations FROM a free plan are excluded —
// losing something that was never paid for isn't churn.
export async function getRevenueOverview(): Promise<{
  mrr: number;
  cancellations30d: number;
  expirations30d: number;
}> {
  const db = getDb();
  const [activeResult, plans] = await Promise.all([
    db.from("subscriptions").select("plan_id, billing_period").in("status", ["active", "trialing"]),
    listAllPlansForAdmin(),
  ]);
  const activeSubs = assertNoError(activeResult, "loading active subscriptions for revenue") as Row[];
  const planById = new Map(plans.map((p) => [p.id, p]));

  let mrr = 0;
  for (const row of activeSubs) {
    const plan = planById.get(row.plan_id as string);
    if (!plan || plan.priceMonthly === 0) continue; // Free plans contribute nothing
    mrr += normalizedMonthlyRevenue(plan, row.billing_period as BillingPeriod);
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const eventsResult = await db
    .from("subscription_events")
    .select("type, detail")
    .in("type", ["cancelled", "expired"])
    .gte("created_at", since);
  const events = assertNoError(eventsResult, "loading churn events") as Row[];

  let cancellations30d = 0;
  let expirations30d = 0;
  for (const event of events) {
    const fromPlanId = (event.detail as { fromPlanId?: string } | null)?.fromPlanId;
    const fromPlan = fromPlanId ? planById.get(fromPlanId) : null;
    if (!fromPlan || fromPlan.priceMonthly === 0) continue; // only losing a PAID plan counts as churn
    if (event.type === "cancelled") cancellations30d++;
    else expirations30d++;
  }

  return { mrr: Math.round(mrr), cancellations30d, expirations30d };
}
