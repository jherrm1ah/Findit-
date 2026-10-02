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
    // the request whose update actually matches a row goes on to create a
    // reward; the loser's select() comes back empty and it stops here.
    const updateResult = await db
      .from("referrals")
      .update({
        status: "qualified",
        qualifying_action: action,
        qualified_at: new Date().toISOString(),
        reward_status: "pending",
      })
      .eq("id", referral.id as string)
      .eq("status", "pending")
      .select("id, referrer_user_id")
      .maybeSingle();
    const updated = assertNoError(updateResult, "qualifying referral") as Row | null;
    if (!updated) return;

    const referrerUserId = updated.referrer_user_id as string;
    const rewardResult = await db.from("referral_rewards").insert({
      id: "rrw_" + crypto.randomBytes(9).toString("hex"),
      referral_id: updated.id as string,
      user_id: referrerUserId,
      status: "pending",
    });
    assertNoError(rewardResult, "creating referral reward");

    await notifyReferrer(
      referrerUserId,
      "A referral just qualified",
      "Someone you referred to FindIt just completed a qualifying action — check your referral dashboard."
    );
  } catch (err) {
    console.error("[referrals] failed to qualify referral:", err);
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

  const activeQualifyingAction = await getActiveQualifyingAction();

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
