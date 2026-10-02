// The referral system's business logic — code issuance, attribution,
// qualification, the reward shell, and the admin-configurable "what counts
// as a successful referral" switch. See migration 035 for the schema.
//
// Deliberately a leaf module: it imports only db/errors/rateLimit, never
// lib/repo.ts, lib/auth.ts, lib/transactionRecord.ts or
// lib/sellerVerification.ts — those four import THIS file (at their own
// single real DB-write entry points) to fire qualification, so this module
// importing any of them back would be a circular import. Its own
// best-effort notification write below (notifyReferrer) is a deliberate,
// small duplication of lib/repo.ts#notifyBestEffort for exactly that
// reason, not an oversight.
import crypto from "crypto";
import { getDb, assertNoError } from "./db";
import { ValidationError } from "./errors";

type Row = Record<string, unknown>;

/* -------------------------------------------------------------------------- */
/*  Referral codes                                                            */
/* -------------------------------------------------------------------------- */

// Same Crockford-style alphabet as lib/transactionRecord.ts's verification
// codes (no I, L, O, U — nothing that can be misread off a screen or
// mistyped into a different valid code), no prefix: this code is the whole
// path segment in /ref/[code], so keeping it short and bare makes for a
// cleaner shareable link than FI-XXXXXXXX would.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 8;
const UNIQUE_VIOLATION = "23505";

function generateReferralCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

// Accepts what someone would actually type/paste (lowercase, surrounding
// whitespace); rejects anything malformed before it ever reaches a query.
export function normalizeReferralCode(input: string): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input.trim().toUpperCase();
  if (cleaned.length !== CODE_LENGTH) return null;
  for (const char of cleaned) {
    if (!ALPHABET.includes(char)) return null;
  }
  return cleaned;
}

// Issues a code for a user who doesn't have one yet; returns the existing
// one otherwise. Called from lib/auth.ts#createUser at signup (so every
// registered user has a code immediately, per the task spec) and again
// defensively here so any account created before this feature shipped gets
// one lazily the first time its dashboard is opened.
export async function ensureReferralCode(userId: string): Promise<string> {
  const db = getDb();
  const existingResult = await db.from("users").select("referral_code").eq("id", userId).maybeSingle();
  const existing = assertNoError(existingResult, "loading referral code") as Row | null;
  if (existing?.referral_code) return existing.referral_code as string;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    const result = await db
      .from("users")
      .update({ referral_code: code })
      .eq("id", userId)
      .is("referral_code", null)
      .select("referral_code")
      .maybeSingle();
    if (!result.error) {
      const row = result.data as Row | null;
      if (row?.referral_code) return row.referral_code as string;
      // Someone else's concurrent call already set it — read back theirs.
      const raceResult = await db.from("users").select("referral_code").eq("id", userId).maybeSingle();
      const raced = assertNoError(raceResult, "re-reading referral code") as Row | null;
      if (raced?.referral_code) return raced.referral_code as string;
      continue;
    }
    if (result.error.code !== UNIQUE_VIOLATION) throw new Error(result.error.message);
    // Code collided with someone else's — try again with a fresh one.
  }
  throw new Error("Couldn't issue a referral code — try again.");
}

async function getUserIdByReferralCode(code: string): Promise<string | null> {
  const db = getDb();
  const result = await db.from("users").select("id").eq("referral_code", code).maybeSingle();
  const row = assertNoError(result, "looking up referral code") as Row | null;
  return (row?.id as string | null) ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Qualifying-action settings — admin-editable, append-only                   */
/*  (same pattern as lib/payments.ts's platform_fee_config)                    */
/* -------------------------------------------------------------------------- */

export type QualifyingAction = "registration" | "first_purchase" | "seller_verification" | "first_product";
const QUALIFYING_ACTIONS: QualifyingAction[] = ["registration", "first_purchase", "seller_verification", "first_product"];

export const QUALIFYING_ACTION_LABELS: Record<QualifyingAction, string> = {
  registration: "Account registration",
  first_purchase: "First completed purchase",
  seller_verification: "Seller verification approved",
  first_product: "First published product",
};

export async function getActiveQualifyingAction(): Promise<QualifyingAction> {
  const db = getDb();
  const result = await db
    .from("referral_settings")
    .select("active_qualifying_action")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = assertNoError(result, "loading referral settings") as Row | null;
  if (!row) {
    // Shouldn't happen — schema.sql/migration 035 seed a default row — but
    // fail loudly rather than silently treating every signup as qualifying.
    throw new Error("No referral qualifying action is configured.");
  }
  return row.active_qualifying_action as QualifyingAction;
}

export async function setActiveQualifyingAction(action: string, adminId: string): Promise<void> {
  if (!QUALIFYING_ACTIONS.includes(action as QualifyingAction)) {
    throw new ValidationError("Unknown qualifying action.");
  }
  const db = getDb();
  const result = await db.from("referral_settings").insert({
    id: "rs_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    active_qualifying_action: action,
    created_by: adminId,
  });
  assertNoError(result, "setting the referral qualifying action");
}

export type QualifyingActionHistoryEntry = {
  id: string;
  action: QualifyingAction;
  createdBy: string | null;
  createdAt: string;
};

export async function listQualifyingActionHistory(): Promise<QualifyingActionHistoryEntry[]> {
  const db = getDb();
  const result = await db.from("referral_settings").select("*").order("created_at", { ascending: false }).limit(50);
  const rows = assertNoError(result, "loading referral settings history") as Row[];
  return rows.map((r) => ({
    id: r.id as string,
    action: r.active_qualifying_action as QualifyingAction,
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

/* -------------------------------------------------------------------------- */
/*  Attribution — creating the referral relationship                           */
/* -------------------------------------------------------------------------- */

// Best-effort, never throws into the caller's signup flow: a malformed or
// unknown code, a self-referral attempt, or a race that already attributed
// this exact account all just mean "no referral row gets created", not a
// failed signup. Called once, at account creation.
export async function attributeReferralBestEffort(referredUserId: string, rawCode: string | null | undefined): Promise<void> {
  if (!rawCode) return;
  try {
    const code = normalizeReferralCode(rawCode);
    if (!code) return;
    const referrerUserId = await getUserIdByReferralCode(code);
    if (!referrerUserId) return;
    // A user can't refer themselves — enforced here AND by the DB check
    // constraint (referrals_no_self_referral), belt and braces.
    if (referrerUserId === referredUserId) return;

    const db = getDb();
    const result = await db.from("referrals").insert({
      id: "ref_" + crypto.randomBytes(9).toString("hex"),
      referrer_user_id: referrerUserId,
      referred_user_id: referredUserId,
      referral_code: code,
      status: "pending",
      reward_status: "none",
    });
    if (result.error && result.error.code !== UNIQUE_VIOLATION) {
      throw new Error(result.error.message);
    }
    // A unique-violation here means this account was already attributed
    // (shouldn't happen for a brand-new user, but the constraint is the
    // real guarantee, not this check) — nothing further to do either way.
  } catch (err) {
    console.error("[referrals] failed to attribute referral:", err);
  }
}

/* -------------------------------------------------------------------------- */
/*  Qualification — turning "pending" into "qualified", server-side only       */
/* -------------------------------------------------------------------------- */

// A tiny, self-contained duplicate of lib/repo.ts#notifyBestEffort — see
// this file's top-of-file comment for why it can't just import that one.
async function notifyReferrer(userId: string, title: string, body: string): Promise<void> {
  try {
    const db = getDb();
    const prefResult = await db.from("users").select("notifications_enabled").eq("id", userId).maybeSingle();
    const pref = assertNoError(prefResult, "checking notification preference") as Row | null;
    if (pref && pref.notifications_enabled === false) return;
    const result = await db.from("notifications").insert({
      id: "n_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      user_id: userId,
      type: "referral",
      title,
      body,
    });
    assertNoError(result, "creating referral notification");
  } catch (err) {
    console.error("[referrals] failed to notify referrer:", err);
  }
}

// Called from each of the four real qualifying events' own single DB-write
// entry point (lib/auth.ts#createUser for 'registration',
// lib/transactionRecord.ts#recordCompletedTransaction for 'first_purchase',
// lib/sellerVerification.ts#adminReviewVerification's approved branch for
// 'seller_verification', lib/repo.ts#createProduct for 'first_product') —
// every time that real-world event happens for that user, not just the
// first. That's intentional, not a missing "is this really their first
// one" check: a referral can only ever transition pending -> qualified
// once (guarded by the conditional update below), so calling this on every
// occurrence is exactly equivalent to only calling it on the first one,
// without this module needing to track per-user occurrence counts itself.
//
// NEVER trusts a client-supplied action or qualification result — this is
// only ever invoked by server code reacting to a real event it just wrote
// to the database itself, never by anything deserialized from a request
// body.
export async function qualifyReferral(userId: string, action: QualifyingAction): Promise<void> {
  try {
    const activeAction = await getActiveQualifyingAction();
    if (action !== activeAction) return;

    const db = getDb();
    const referralResult = await db
      .from("referrals")
      .select("id, referrer_user_id")
      .eq("referred_user_id", userId)
      .eq("status", "pending")
      .maybeSingle();
    const referral = assertNoError(referralResult, "loading referral") as Row | null;
    if (!referral) return;

    // Conditioned on status still being 'pending' at the moment of the
    // write, not just when it was read above — closes the race where two
    // qualifying events fire for the same user at once (e.g. a purchase
    // and an admin seller-verification approval landing together). Only
    // the request whose update actually matches a row goes on to check the
    // milestone below; the loser's select() comes back empty and it stops
    // here.
    const updateResult = await db
      .from("referrals")
      .update({
        status: "qualified",
        qualifying_action: action,
        qualified_at: new Date().toISOString(),
      })
      .eq("id", referral.id as string)
      .eq("status", "pending")
      .select("id, referrer_user_id")
      .maybeSingle();
    const updated = assertNoError(updateResult, "qualifying referral") as Row | null;
    if (!updated) return;

    const referrerUserId = updated.referrer_user_id as string;
    await notifyReferrer(
      referrerUserId,
      "A referral just qualified",
      "Someone you referred to FindIt just completed a qualifying action — check your referral dashboard."
    );

    await maybeIssueMilestoneReward(referrerUserId, updated.id as string);
  } catch (err) {
    console.error("[referrals] failed to qualify referral:", err);
  }
}

/* -------------------------------------------------------------------------- */
/*  Reward config — admin-editable, append-only (migration 036)               */
/* -------------------------------------------------------------------------- */

export type ReferralRewardConfig = { milestoneSize: number; rewardAmount: number };

export async function getReferralRewardConfig(): Promise<ReferralRewardConfig> {
  const db = getDb();
  const result = await db
    .from("referral_reward_config")
    .select("milestone_size, reward_amount")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = assertNoError(result, "loading referral reward config") as Row | null;
  if (!row) {
    // Shouldn't happen — migration 036 seeds a default row — but fail
    // loudly rather than silently issuing a reward with no amount.
    throw new Error("No referral reward config is set.");
  }
  return { milestoneSize: row.milestone_size as number, rewardAmount: row.reward_amount as number };
}

export async function setReferralRewardConfig(milestoneSize: number, rewardAmount: number, adminId: string): Promise<void> {
  if (!Number.isInteger(milestoneSize) || milestoneSize < 1) {
    throw new ValidationError("Milestone size must be a whole number of at least 1 referral.");
  }
  if (!Number.isInteger(rewardAmount) || rewardAmount < 0) {
    throw new ValidationError("Reward amount must be a whole, non-negative number of naira.");
  }
  const db = getDb();
  const result = await db.from("referral_reward_config").insert({
    id: "rrc_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    milestone_size: milestoneSize,
    reward_amount: rewardAmount,
    created_by: adminId,
  });
  assertNoError(result, "setting the referral reward config");
}

export type ReferralRewardConfigHistoryEntry = {
  id: string;
  milestoneSize: number;
  rewardAmount: number;
  createdBy: string | null;
  createdAt: string;
};

export async function listReferralRewardConfigHistory(): Promise<ReferralRewardConfigHistoryEntry[]> {
  const db = getDb();
  const result = await db.from("referral_reward_config").select("*").order("created_at", { ascending: false }).limit(50);
  const rows = assertNoError(result, "loading referral reward config history") as Row[];
  return rows.map((r) => ({
    id: r.id as string,
    milestoneSize: r.milestone_size as number,
    rewardAmount: r.reward_amount as number,
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

// Checks whether the referrer's Nth qualified referral (N = the config's
// milestone_size) was just reached, and if so, issues the real, spendable
// credit reward — attached to the referral that completed the batch. Every
// qualifying event in the batch calls this (via qualifyReferral above), but
// it only actually issues a reward on the one call where the count divides
// evenly, so this is as safe to call repeatedly as qualifyReferral itself.
//
// Deliberately recomputes the referrer's qualified count fresh each time
// rather than keeping a running counter anywhere — a referral can be
// disputed/refunded independently of this, and there is exactly one source
// of truth for "how many qualified referrals does this person have":
// counting the referrals table itself.
async function maybeIssueMilestoneReward(referrerUserId: string, justQualifiedReferralId: string): Promise<void> {
  const { milestoneSize, rewardAmount } = await getReferralRewardConfig();

  const db = getDb();
  const countResult = await db
    .from("referrals")
    .select("id")
    .eq("referrer_user_id", referrerUserId)
    .in("status", ["qualified", "rewarded"]);
  const qualifiedReferrals = assertNoError(countResult, "counting qualified referrals") as Row[];
  if (qualifiedReferrals.length === 0 || qualifiedReferrals.length % milestoneSize !== 0) return;
  const milestoneNumber = qualifiedReferrals.length / milestoneSize;

  // Conditioned on the just-qualified referral's own reward_status still
  // being 'none' — a cheap first-pass guard, but NOT sufficient on its own:
  // two DIFFERENT referrals for the same referrer qualifying at nearly the
  // same instant each read their own fresh count, each see it land on a
  // multiple of milestoneSize, and each pass this check (it's keyed per
  // referral, not per milestone) — see migration 038's own comment. The
  // insert below is what actually stops a double-issue.
  const claimResult = await db
    .from("referrals")
    .update({ reward_status: "issued" })
    .eq("id", justQualifiedReferralId)
    .eq("reward_status", "none")
    .select("id")
    .maybeSingle();
  const claimed = assertNoError(claimResult, "claiming the milestone") as Row | null;
  if (!claimed) return;

  const rewardResult = await db.from("referral_rewards").insert({
    id: "rrw_" + crypto.randomBytes(9).toString("hex"),
    referral_id: justQualifiedReferralId,
    user_id: referrerUserId,
    reward_type: "credit",
    status: "issued",
    amount: rewardAmount,
    remaining_amount: rewardAmount,
    milestone_number: milestoneNumber,
    issued_at: new Date().toISOString(),
  });
  if (rewardResult.error) {
    // A unique violation on (user_id, milestone_number) means a different
    // referral for this same referrer already claimed this exact milestone
    // slot (the race described above) — back out this referral's own flag
    // so it doesn't sit marked 'issued' with no real reward behind it. The
    // milestone was still correctly paid out exactly once, just via the
    // other referral.
    if (rewardResult.error.code === "23505") {
      await db.from("referrals").update({ reward_status: "none" }).eq("id", justQualifiedReferralId).eq("reward_status", "issued");
      return;
    }
    throw new Error(`issuing milestone reward: ${rewardResult.error.message}`);
  }

  await notifyReferrer(
    referrerUserId,
    "You earned FindIt credit",
    `You've referred ${qualifiedReferrals.length} people who qualified — ₦${rewardAmount.toLocaleString("en-NG")} in FindIt credit has been added to your account.`
  );
}

/* -------------------------------------------------------------------------- */
/*  Spending credit — reserved at checkout, released if the attempt fails      */
/* -------------------------------------------------------------------------- */

// The ONLY number a client's "apply my credit" request is ever trusted
// for is whether to apply it at all — the amount always comes from this,
// never from the request body. Sums what's actually left to spend, never
// the original grant.
export async function getAvailableCredit(userId: string): Promise<number> {
  const db = getDb();
  const result = await db
    .from("referral_rewards")
    .select("remaining_amount")
    .eq("user_id", userId)
    .eq("status", "issued");
  const rows = assertNoError(result, "loading available credit") as Row[];
  return rows.reduce((sum, r) => sum + ((r.remaining_amount as number | null) ?? 0), 0);
}

// Reserves up to `desiredAmount` of the user's available credit against one
// checkout attempt (payment_id), decrementing reward rows oldest-first and
// recording exactly how much of which reward went where. Reserved the
// moment checkout starts — before any Paystack call — specifically so two
// concurrent checkout attempts can never both spend the same naira: each
// row's update is conditioned on remaining_amount still being what this
// function just read, so a concurrent reservation against the same reward
// row can claim at most what's actually left.
//
// Returns the amount actually reserved, which may be less than
// `desiredAmount` if a concurrent checkout reserved some of this user's
// credit first — callers must use the RETURNED amount as the real discount,
// never assume the full desired amount was granted.
export async function reserveCredit(
  userId: string,
  orderId: string,
  paymentId: string,
  desiredAmount: number
): Promise<number> {
  if (desiredAmount <= 0) return 0;
  const db = getDb();
  const rewardsResult = await db
    .from("referral_rewards")
    .select("id, remaining_amount")
    .eq("user_id", userId)
    .eq("status", "issued")
    .order("issued_at", { ascending: true });
  const rewards = assertNoError(rewardsResult, "loading rewards to reserve") as Row[];

  let remainingToReserve = desiredAmount;
  let totalReserved = 0;
  for (const reward of rewards) {
    if (remainingToReserve <= 0) break;
    const rewardId = reward.id as string;
    const available = (reward.remaining_amount as number | null) ?? 0;
    if (available <= 0) continue;
    const take = Math.min(available, remainingToReserve);

    const updateResult = await db
      .from("referral_rewards")
      .update({
        remaining_amount: available - take,
        status: available - take === 0 ? "claimed" : "issued",
        claimed_at: available - take === 0 ? new Date().toISOString() : null,
      })
      .eq("id", rewardId)
      .eq("remaining_amount", available) // only succeeds if nothing else touched this row since the read above
      .select("id")
      .maybeSingle();
    const applied = assertNoError(updateResult, "reserving credit") as Row | null;
    if (!applied) continue; // lost the race on this row — move on, nothing reserved from it

    const ledgerResult = await db.from("referral_credit_applications").insert({
      id: "rca_" + crypto.randomBytes(9).toString("hex"),
      reward_id: rewardId,
      user_id: userId,
      payment_id: paymentId,
      order_id: orderId,
      amount: take,
    });
    assertNoError(ledgerResult, "recording credit application");

    totalReserved += take;
    remainingToReserve -= take;
  }
  return totalReserved;
}

// Gives back every unreleased credit reservation tied to a checkout attempt
// that didn't end in a real payment (Paystack init failed, or the charge
// itself failed) — called from the pay route's own failure path and from
// the webhook's charge.failed handler. Never called for a SUCCEEDED
// payment: once an order is actually paid, the reservation is final.
export async function releaseCredit(paymentId: string): Promise<void> {
  try {
    const db = getDb();
    const applicationsResult = await db
      .from("referral_credit_applications")
      .select("id, reward_id, amount")
      .eq("payment_id", paymentId)
      .is("released_at", null);
    const applications = assertNoError(applicationsResult, "loading credit applications to release") as Row[];
    if (applications.length === 0) return;

    for (const application of applications) {
      const rewardId = application.reward_id as string;
      const amount = application.amount as number;

      // Retried under optimistic concurrency, same pattern as
      // reserveCredit's own CAS above — two releases landing at once
      // against the SAME reward row (plausible: a user's credit is spent
      // oldest-first, so two failed checkout attempts easily draw from the
      // same reward) must never silently lose one restoration to the
      // other's overwrite. Re-reads and retries rather than reserveCredit's
      // "move on to a different row" — there is no other row to fall back
      // to, this exact amount has to land back on this exact reward.
      let restoredOk = false;
      for (let attempt = 0; attempt < 5 && !restoredOk; attempt++) {
        const rewardResult = await db
          .from("referral_rewards")
          .select("remaining_amount")
          .eq("id", rewardId)
          .maybeSingle();
        const reward = assertNoError(rewardResult, "loading reward to release") as Row | null;
        if (!reward) break; // reward row gone — nothing left to restore to

        const current = (reward.remaining_amount as number | null) ?? 0;
        const updateResult = await db
          .from("referral_rewards")
          .update({ remaining_amount: current + amount, status: "issued", claimed_at: null })
          .eq("id", rewardId)
          .eq("remaining_amount", current)
          .select("id")
          .maybeSingle();
        if (assertNoError(updateResult, "restoring released credit")) restoredOk = true;
      }
      if (!restoredOk) {
        // Same best-effort tolerance as the outer catch below — leaves
        // this application unreleased (still excluded by future releases
        // via released_at IS NULL) rather than marking it released when
        // the restore never actually landed.
        console.error(`[referrals] couldn't restore credit for application ${application.id} — reward ${rewardId} kept changing under us`);
        continue;
      }

      const releasedResult = await db
        .from("referral_credit_applications")
        .update({ released_at: new Date().toISOString() })
        .eq("id", application.id as string);
      assertNoError(releasedResult, "marking credit application released");
    }
  } catch (err) {
    // Best-effort — a failure to release just means that credit stays
    // reserved against a dead checkout attempt until an admin notices,
    // same tolerance this app already has for a stale pending payment
    // blocking a retry for a while (see PENDING_PAYMENT_STALE_MS).
    console.error("[referrals] failed to release credit:", err);
  }
}

/* -------------------------------------------------------------------------- */
/*  The referral dashboard                                                     */
/* -------------------------------------------------------------------------- */

export type ReferralDashboard = {
  referralCode: string;
  referralPath: string;
  totalReferred: number;
  successfulReferrals: number;
  pendingReferrals: number;
  rewardsEarned: number;
  rewardsClaimed: number;
  progressPercent: number;
  activeQualifyingAction: QualifyingAction;
  // Real, spendable FindIt credit (lib/referrals.ts#getAvailableCredit) —
  // naira left to apply at checkout, not the lifetime total ever earned.
  availableCredit: number;
  milestoneSize: number;
  // How many MORE successful referrals until the next reward — 0 only
  // right after a milestone lands and before the next referral starts a
  // new batch; otherwise always between 1 and milestoneSize.
  referralsUntilNextReward: number;
};

export async function getReferralDashboard(userId: string): Promise<ReferralDashboard> {
  const referralCode = await ensureReferralCode(userId);
  const db = getDb();

  const referralsResult = await db.from("referrals").select("status").eq("referrer_user_id", userId);
  const referrals = assertNoError(referralsResult, "loading referrals") as Row[];
  const totalReferred = referrals.length;
  const successfulReferrals = referrals.filter((r) => r.status === "qualified" || r.status === "rewarded").length;
  const pendingReferrals = referrals.filter((r) => r.status === "pending").length;

  const rewardsResult = await db.from("referral_rewards").select("status").eq("user_id", userId);
  const rewards = assertNoError(rewardsResult, "loading referral rewards") as Row[];
  const rewardsEarned = rewards.length;
  const rewardsClaimed = rewards.filter((r) => r.status === "claimed").length;

  const [activeQualifyingAction, availableCredit, { milestoneSize }] = await Promise.all([
    getActiveQualifyingAction(),
    getAvailableCredit(userId),
    getReferralRewardConfig(),
  ]);

  const progressWithinBatch = successfulReferrals % milestoneSize;

  return {
    referralCode,
    referralPath: `/ref/${referralCode}`,
    totalReferred,
    successfulReferrals,
    pendingReferrals,
    rewardsEarned,
    rewardsClaimed,
    progressPercent: totalReferred > 0 ? Math.round((successfulReferrals / totalReferred) * 100) : 0,
    activeQualifyingAction,
    availableCredit,
    milestoneSize,
    referralsUntilNextReward: progressWithinBatch === 0 ? milestoneSize : milestoneSize - progressWithinBatch,
  };
}

/* -------------------------------------------------------------------------- */
/*  Admin views — real data only, nothing mocked                               */
/* -------------------------------------------------------------------------- */

export type AdminReferralOverview = {
  totalUsersWithCode: number;
  totalReferrals: number;
  successfulReferrals: number;
  pendingReferrals: number;
  rewardsIssued: number;
};

export type AdminReferralRow = {
  id: string;
  referrerUserId: string;
  referrerName: string | null;
  referredUserId: string;
  referredName: string | null;
  referralCode: string;
  status: string;
  qualifyingAction: string | null;
  rewardStatus: string;
  createdAt: string;
  qualifiedAt: string | null;
};

export async function getAdminReferralOverview(): Promise<AdminReferralOverview> {
  const db = getDb();
  const [usersWithCodeResult, referralsResult, rewardsResult] = await Promise.all([
    db.from("users").select("id").not("referral_code", "is", null),
    db.from("referrals").select("status"),
    db.from("referral_rewards").select("id"),
  ]);
  const usersWithCode = assertNoError(usersWithCodeResult, "counting users with referral codes") as Row[];
  const referralRows = assertNoError(referralsResult, "loading referrals") as Row[];
  const rewardRows = assertNoError(rewardsResult, "counting referral rewards") as Row[];

  return {
    totalUsersWithCode: usersWithCode.length,
    totalReferrals: referralRows.length,
    successfulReferrals: referralRows.filter((r) => r.status === "qualified" || r.status === "rewarded").length,
    pendingReferrals: referralRows.filter((r) => r.status === "pending").length,
    rewardsIssued: rewardRows.length,
  };
}

// Recent referral relationships for the admin screen, joined against users
// for display names. Limited to 200 most-recent — this is an investigation
// tool, not a full export.
export async function listReferralsForAdmin(): Promise<AdminReferralRow[]> {
  const db = getDb();
  const result = await db.from("referrals").select("*").order("created_at", { ascending: false }).limit(200);
  const rows = assertNoError(result, "loading referrals") as Row[];
  if (rows.length === 0) return [];

  const userIds = [...new Set(rows.flatMap((r) => [r.referrer_user_id as string, r.referred_user_id as string]))];
  const usersResult = await db.from("users").select("id, name, business_name").in("id", userIds);
  const users = assertNoError(usersResult, "loading referral users") as Row[];
  const nameById = new Map(users.map((u) => [u.id as string, (u.business_name as string | null) || (u.name as string)]));

  return rows.map((r) => ({
    id: r.id as string,
    referrerUserId: r.referrer_user_id as string,
    referrerName: nameById.get(r.referrer_user_id as string) ?? null,
    referredUserId: r.referred_user_id as string,
    referredName: nameById.get(r.referred_user_id as string) ?? null,
    referralCode: r.referral_code as string,
    status: r.status as string,
    qualifyingAction: (r.qualifying_action as string | null) ?? null,
    rewardStatus: r.reward_status as string,
    createdAt: r.created_at as string,
    qualifiedAt: (r.qualified_at as string | null) ?? null,
  }));
}

export type SuspiciousReferralActivity = {
  referrerUserId: string;
  referrerName: string | null;
  referralCount: number;
  earliestCreatedAt: string;
  latestCreatedAt: string;
};

// A simple, real-data heuristic — not a fraud model, just the one pattern
// worth a human's attention on a brand-new program: one account producing
// an unusually large number of referral rows in a short window (a script,
// or one person signing up many throwaway accounts under their own code).
// SUSPICIOUS_THRESHOLD and SUSPICIOUS_WINDOW_MS are deliberately generous
// (a real influencer sharing a code at launch will refer many people
// without this ever being abuse) — this surfaces outliers for a human to
// look at, it never auto-blocks or auto-revokes anything itself.
const SUSPICIOUS_THRESHOLD = 10;
const SUSPICIOUS_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function listSuspiciousReferralActivity(): Promise<SuspiciousReferralActivity[]> {
  const db = getDb();
  const result = await db
    .from("referrals")
    .select("referrer_user_id, created_at")
    .order("created_at", { ascending: true });
  const rows = assertNoError(result, "loading referrals for abuse detection") as Row[];

  const byReferrer = new Map<string, number[]>();
  for (const row of rows) {
    const referrerId = row.referrer_user_id as string;
    const createdAt = new Date(row.created_at as string).getTime();
    const list = byReferrer.get(referrerId) ?? [];
    list.push(createdAt);
    byReferrer.set(referrerId, list);
  }

  const suspicious: SuspiciousReferralActivity[] = [];
  for (const [referrerId, timestamps] of byReferrer) {
    timestamps.sort((a, b) => a - b);
    // Sliding window: does any SUSPICIOUS_WINDOW_MS span contain at least
    // SUSPICIOUS_THRESHOLD referrals?
    for (let i = 0; i + SUSPICIOUS_THRESHOLD - 1 < timestamps.length; i++) {
      const windowEnd = timestamps[i + SUSPICIOUS_THRESHOLD - 1];
      if (windowEnd - timestamps[i] <= SUSPICIOUS_WINDOW_MS) {
        suspicious.push({
          referrerUserId: referrerId,
          referrerName: null,
          referralCount: timestamps.length,
          earliestCreatedAt: new Date(timestamps[0]).toISOString(),
          latestCreatedAt: new Date(timestamps[timestamps.length - 1]).toISOString(),
        });
        break;
      }
    }
  }

  if (suspicious.length === 0) return [];
  const usersResult = await db
    .from("users")
    .select("id, name, business_name")
    .in("id", suspicious.map((s) => s.referrerUserId));
  const users = assertNoError(usersResult, "loading suspicious referrers") as Row[];
  const nameById = new Map(users.map((u) => [u.id as string, (u.business_name as string | null) || (u.name as string)]));
  return suspicious.map((s) => ({ ...s, referrerName: nameById.get(s.referrerUserId) ?? null }));
}
