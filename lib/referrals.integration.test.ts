import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";

// The guarantees that actually matter here: a referral can't be self-made,
// an account can only ever be attributed once, qualifying only happens for
// the currently-active action, qualifying is idempotent, a reward only
// issues once a milestone batch is actually complete, and credit can be
// spent (fully or partially) and given back if a checkout attempt never
// finishes — exactly the anti-abuse and money-safety properties the
// referral system exists to enforce, exercised against real
// lib/referrals.ts logic rather than reimplemented test-only versions of it.

const fakeDb: FakeSupabase = createFakeSupabase();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeDb,
}));

process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const {
  normalizeReferralCode,
  ensureReferralCode,
  attributeReferralBestEffort,
  qualifyReferral,
  getActiveQualifyingAction,
  setActiveQualifyingAction,
  getReferralRewardConfig,
  setReferralRewardConfig,
  getReferralDashboard,
  getAdminReferralOverview,
  listReferralsForAdmin,
  getAvailableCredit,
  reserveCredit,
  releaseCredit,
} = await import("./referrals");

function seedWorld(overrides: { activeQualifyingAction?: string; milestoneSize?: number; rewardAmount?: number } = {}) {
  fakeDb.reset({
    users: [
      { id: "referrer_1", name: "Amaka", notifications_enabled: true, referral_code: "ABCDEFGH" },
      { id: "referred_1", name: "Bello", notifications_enabled: true },
      { id: "referred_2", name: "Chidi", notifications_enabled: true },
      { id: "referred_3", name: "Dapo", notifications_enabled: true },
      { id: "referred_4", name: "Efe", notifications_enabled: true },
    ],
    referral_settings: [
      {
        id: "rs_default",
        active_qualifying_action: overrides.activeQualifyingAction ?? "first_purchase",
        created_by: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    // Defaults to a milestone of 1 — so tests about qualification mechanics
    // itself (not specifically about batching) still see an immediate
    // reward, same as before milestones existed. The dedicated "milestone
    // batching" describe block below overrides this to something larger.
    referral_reward_config: [
      {
        id: "rrc_default",
        milestone_size: overrides.milestoneSize ?? 1,
        reward_amount: overrides.rewardAmount ?? 1100,
        created_by: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    referrals: [],
    referral_rewards: [],
    referral_credit_applications: [],
    notifications: [],
    payments: [],
    orders: [],
  });
}

beforeEach(() => {
  fakeDb.reset();
});

describe("normalizeReferralCode", () => {
  it("accepts lowercase and trims whitespace", () => {
    expect(normalizeReferralCode(" abcdefgh ")).toBe("ABCDEFGH");
  });
  it("rejects the wrong length", () => {
    expect(normalizeReferralCode("ABC")).toBeNull();
  });
  it("rejects characters outside the alphabet (no I, L, O, U)", () => {
    expect(normalizeReferralCode("ABCDEFIL")).toBeNull();
  });
});

describe("ensureReferralCode", () => {
  it("issues a code for a user with none, and is idempotent", async () => {
    seedWorld();
    const first = await ensureReferralCode("referred_1");
    // The Crockford-style alphabet excludes I, L, O, U.
    expect(first).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    const second = await ensureReferralCode("referred_1");
    expect(second).toBe(first);
  });

  it("returns the existing code rather than overwriting it", async () => {
    seedWorld();
    expect(await ensureReferralCode("referrer_1")).toBe("ABCDEFGH");
  });
});

describe("attributeReferralBestEffort", () => {
  it("creates a referral row for a valid code and a different user", async () => {
    seedWorld();
    await attributeReferralBestEffort("referred_1", "ABCDEFGH");
    const rows = fakeDb.dump("referrals");
    expect(rows).toHaveLength(1);
    expect(rows[0].referrer_user_id).toBe("referrer_1");
    expect(rows[0].referred_user_id).toBe("referred_1");
    expect(rows[0].status).toBe("pending");
  });

  it("never attributes a user to themselves", async () => {
    seedWorld();
    await attributeReferralBestEffort("referrer_1", "ABCDEFGH");
    expect(fakeDb.dump("referrals")).toHaveLength(0);
  });

  it("silently no-ops for an unknown code", async () => {
    seedWorld();
    await attributeReferralBestEffort("referred_1", "ZZZZZZZZ");
    expect(fakeDb.dump("referrals")).toHaveLength(0);
  });

  it("silently no-ops when no code was given", async () => {
    seedWorld();
    await attributeReferralBestEffort("referred_1", null);
    expect(fakeDb.dump("referrals")).toHaveLength(0);
  });

  it("never creates a second attribution for an already-attributed account", async () => {
    seedWorld();
    fakeDb.reset({
      users: fakeDb.dump("users"),
      referral_settings: fakeDb.dump("referral_settings"),
      referral_reward_config: fakeDb.dump("referral_reward_config"),
      referrals: [
        { id: "ref_existing", referrer_user_id: "referrer_1", referred_user_id: "referred_1", referral_code: "ABCDEFGH", status: "pending", reward_status: "none", created_at: "2026-01-01T00:00:00.000Z" },
      ],
    });
    await attributeReferralBestEffort("referred_1", "ABCDEFGH");
    expect(fakeDb.dump("referrals")).toHaveLength(1);
  });
});

describe("qualifyReferral (milestone size 1 — every qualification rewards)", () => {
  it("qualifies a pending referral and issues real credit when the action matches", async () => {
    seedWorld({ activeQualifyingAction: "first_purchase" });
    await attributeReferralBestEffort("referred_1", "ABCDEFGH");

    await qualifyReferral("referred_1", "first_purchase");

    const referral = fakeDb.dump("referrals")[0];
    expect(referral.status).toBe("qualified");
    expect(referral.qualifying_action).toBe("first_purchase");
    expect(referral.reward_status).toBe("issued");

    const rewards = fakeDb.dump("referral_rewards");
    expect(rewards).toHaveLength(1);
    expect(rewards[0].user_id).toBe("referrer_1");
    expect(rewards[0].reward_type).toBe("credit");
    expect(rewards[0].amount).toBe(1100);
    expect(rewards[0].remaining_amount).toBe(1100);
    expect(rewards[0].status).toBe("issued");
  });

  it("does nothing when the action isn't the currently-active one", async () => {
    seedWorld({ activeQualifyingAction: "seller_verification" });
    await attributeReferralBestEffort("referred_1", "ABCDEFGH");

    await qualifyReferral("referred_1", "first_purchase");

    expect(fakeDb.dump("referrals")[0].status).toBe("pending");
    expect(fakeDb.dump("referral_rewards")).toHaveLength(0);
  });

  it("is idempotent — a second qualifying event never creates a second reward", async () => {
    seedWorld({ activeQualifyingAction: "first_purchase" });
    await attributeReferralBestEffort("referred_1", "ABCDEFGH");

    await qualifyReferral("referred_1", "first_purchase");
    await qualifyReferral("referred_1", "first_purchase");

    expect(fakeDb.dump("referral_rewards")).toHaveLength(1);
  });

  it("does nothing for a user with no referral at all", async () => {
    seedWorld();
    await qualifyReferral("referred_2", "first_purchase");
    expect(fakeDb.dump("referral_rewards")).toHaveLength(0);
  });
});

describe("milestone batching", () => {
  it("only issues a reward on the Nth qualified referral, not every one", async () => {
    seedWorld({ activeQualifyingAction: "first_purchase", milestoneSize: 3, rewardAmount: 900 });
    await attributeReferralBestEffort("referred_1", "ABCDEFGH");
    await attributeReferralBestEffort("referred_2", "ABCDEFGH");
    await attributeReferralBestEffort("referred_3", "ABCDEFGH");
    await attributeReferralBestEffort("referred_4", "ABCDEFGH");

    await qualifyReferral("referred_1", "first_purchase");
    expect(fakeDb.dump("referral_rewards")).toHaveLength(0);

    await qualifyReferral("referred_2", "first_purchase");
    expect(fakeDb.dump("referral_rewards")).toHaveLength(0);

    await qualifyReferral("referred_3", "first_purchase");
    const rewardsAfterThird = fakeDb.dump("referral_rewards");
    expect(rewardsAfterThird).toHaveLength(1);
    expect(rewardsAfterThird[0].amount).toBe(900);
    // Attached to the referral that actually completed the batch.
    const thirdReferral = fakeDb.dump("referrals").find((r) => r.referred_user_id === "referred_3");
    expect(thirdReferral?.reward_status).toBe("issued");
    const firstReferral = fakeDb.dump("referrals").find((r) => r.referred_user_id === "referred_1");
    expect(firstReferral?.reward_status).toBe("none");

    // The 4th starts a fresh batch — no reward yet.
    await qualifyReferral("referred_4", "first_purchase");
    expect(fakeDb.dump("referral_rewards")).toHaveLength(1);
  });

  // Two DIFFERENT referrals for the same referrer qualifying at nearly the
  // same instant — e.g. two requests landing together — each run their own
  // fresh "how many qualified referrals does this referrer have" count.
  // Run concurrently (not awaited one at a time), the fake DB's genuinely
  // async resolution lets both qualifyReferral calls interleave exactly
  // like two real concurrent requests would, so both can see the same
  // pre-milestone count and both attempt to issue the reward. Only one
  // must actually win.
  it("issues exactly one reward even when two referrals cross the milestone at the same instant", async () => {
    seedWorld({ activeQualifyingAction: "first_purchase", milestoneSize: 2, rewardAmount: 900 });
    await attributeReferralBestEffort("referred_1", "ABCDEFGH");
    await attributeReferralBestEffort("referred_2", "ABCDEFGH");

    await Promise.all([
      qualifyReferral("referred_1", "first_purchase"),
      qualifyReferral("referred_2", "first_purchase"),
    ]);

    const rewards = fakeDb.dump("referral_rewards");
    expect(rewards).toHaveLength(1);
    expect(rewards[0].amount).toBe(900);

    // Exactly one of the two referrals ends up actually carrying the
    // reward flag — never both, never neither.
    const referrals = fakeDb.dump("referrals");
    const issuedCount = referrals.filter((r) => r.reward_status === "issued").length;
    expect(issuedCount).toBe(1);
  });
});

describe("the qualifying-action setting", () => {
  it("defaults to the seeded setting and changes are append-only", async () => {
    seedWorld({ activeQualifyingAction: "first_purchase" });
    expect(await getActiveQualifyingAction()).toBe("first_purchase");

    await setActiveQualifyingAction("seller_verification", "admin_1");
    expect(await getActiveQualifyingAction()).toBe("seller_verification");
    // The old row is still there — append-only, never overwritten.
    expect(fakeDb.dump("referral_settings")).toHaveLength(2);
  });

  it("rejects an unknown action", async () => {
    seedWorld();
    await expect(setActiveQualifyingAction("give_them_cash", "admin_1")).rejects.toThrow(/unknown/i);
  });
});

describe("the reward config setting", () => {
  it("defaults to the seeded config and changes are append-only", async () => {
    seedWorld({ milestoneSize: 10, rewardAmount: 1100 });
    expect(await getReferralRewardConfig()).toEqual({ milestoneSize: 10, rewardAmount: 1100 });

    await setReferralRewardConfig(5, 2000, "admin_1");
    expect(await getReferralRewardConfig()).toEqual({ milestoneSize: 5, rewardAmount: 2000 });
    expect(fakeDb.dump("referral_reward_config")).toHaveLength(2);
  });

  it("rejects a non-positive milestone size or a negative amount", async () => {
    seedWorld();
    await expect(setReferralRewardConfig(0, 1000, "admin_1")).rejects.toThrow(/milestone size/i);
    await expect(setReferralRewardConfig(10, -5, "admin_1")).rejects.toThrow(/non-negative/i);
  });
});

describe("credit ledger", () => {
  it("getAvailableCredit sums only unspent, issued rewards", async () => {
    seedWorld();
    fakeDb.reset({
      ...Object.fromEntries(["users", "referral_settings", "referral_reward_config"].map((t) => [t, fakeDb.dump(t)])),
      referral_rewards: [
        { id: "rw1", referral_id: "ref1", user_id: "referrer_1", reward_type: "credit", status: "issued", amount: 1100, remaining_amount: 1100, created_at: "2026-01-01T00:00:00.000Z" },
        { id: "rw2", referral_id: "ref2", user_id: "referrer_1", reward_type: "credit", status: "issued", amount: 1100, remaining_amount: 400, created_at: "2026-01-02T00:00:00.000Z" },
        { id: "rw3", referral_id: "ref3", user_id: "referrer_1", reward_type: "credit", status: "claimed", amount: 1100, remaining_amount: 0, created_at: "2026-01-03T00:00:00.000Z" },
      ],
    });
    expect(await getAvailableCredit("referrer_1")).toBe(1500);
  });

  it("reserveCredit spends oldest-first and can partially consume a reward", async () => {
    seedWorld();
    fakeDb.reset({
      ...Object.fromEntries(["users", "referral_settings", "referral_reward_config"].map((t) => [t, fakeDb.dump(t)])),
      referral_rewards: [
        { id: "rw_old", referral_id: "ref1", user_id: "referrer_1", reward_type: "credit", status: "issued", amount: 1100, remaining_amount: 1100, issued_at: "2026-01-01T00:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z" },
        { id: "rw_new", referral_id: "ref2", user_id: "referrer_1", reward_type: "credit", status: "issued", amount: 1100, remaining_amount: 1100, issued_at: "2026-01-02T00:00:00.000Z", created_at: "2026-01-02T00:00:00.000Z" },
      ],
      payments: [{ id: "pay_1", user_id: "referrer_1", order_id: "order_1", kind: "order", amount: 400, status: "pending" }],
      orders: [{ id: "order_1", user_id: "referrer_1", price: 1500 }],
    });

    const reserved = await reserveCredit("referrer_1", "order_1", "pay_1", 1500);
    expect(reserved).toBe(1500); // 1100 from rw_old + 400 from rw_new

    const rwOld = fakeDb.dump("referral_rewards").find((r) => r.id === "rw_old");
    expect(rwOld?.remaining_amount).toBe(0);
    expect(rwOld?.status).toBe("claimed");

    const rwNew = fakeDb.dump("referral_rewards").find((r) => r.id === "rw_new");
    expect(rwNew?.remaining_amount).toBe(700);
    expect(rwNew?.status).toBe("issued");

    const applications = fakeDb.dump("referral_credit_applications");
    expect(applications).toHaveLength(2);
    expect(applications.reduce((sum, a) => sum + (a.amount as number), 0)).toBe(1500);
  });

  it("never reserves more than is actually available", async () => {
    seedWorld();
    fakeDb.reset({
      ...Object.fromEntries(["users", "referral_settings", "referral_reward_config"].map((t) => [t, fakeDb.dump(t)])),
      referral_rewards: [
        { id: "rw1", referral_id: "ref1", user_id: "referrer_1", reward_type: "credit", status: "issued", amount: 500, remaining_amount: 500, issued_at: "2026-01-01T00:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z" },
      ],
      payments: [{ id: "pay_1", user_id: "referrer_1", order_id: "order_1", kind: "order", amount: 2000, status: "pending" }],
      orders: [{ id: "order_1", user_id: "referrer_1", price: 2500 }],
    });

    const reserved = await reserveCredit("referrer_1", "order_1", "pay_1", 2500);
    expect(reserved).toBe(500); // only what existed, even though 2500 was desired
  });

  it("releaseCredit gives back exactly what an unreleased application reserved", async () => {
    seedWorld();
    fakeDb.reset({
      ...Object.fromEntries(["users", "referral_settings", "referral_reward_config"].map((t) => [t, fakeDb.dump(t)])),
      referral_rewards: [
        { id: "rw1", referral_id: "ref1", user_id: "referrer_1", reward_type: "credit", status: "issued", amount: 1100, remaining_amount: 1100, issued_at: "2026-01-01T00:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z" },
      ],
      payments: [{ id: "pay_1", user_id: "referrer_1", order_id: "order_1", kind: "order", amount: 0, status: "pending" }],
      orders: [{ id: "order_1", user_id: "referrer_1", price: 1100 }],
    });

    await reserveCredit("referrer_1", "order_1", "pay_1", 1100);
    expect(fakeDb.dump("referral_rewards")[0].status).toBe("claimed");
    expect(await getAvailableCredit("referrer_1")).toBe(0);

    await releaseCredit("pay_1");
    expect(fakeDb.dump("referral_rewards")[0].status).toBe("issued");
    expect(fakeDb.dump("referral_rewards")[0].remaining_amount).toBe(1100);
    expect(await getAvailableCredit("referrer_1")).toBe(1100);
    expect(fakeDb.dump("referral_credit_applications")[0].released_at).not.toBeNull();
  });

  // Credit is spent oldest-first, so two separate failed checkout attempts
  // easily end up drawing from — and needing to release back to — the SAME
  // reward row. Run concurrently, a naive "read remaining_amount, then
  // write remaining_amount + this application's amount" would let one
  // release's write silently overwrite the other's. Both must land.
  it("never loses one release's restoration to another's, when two releases hit the same reward row at once", async () => {
    seedWorld();
    fakeDb.reset({
      ...Object.fromEntries(["users", "referral_settings", "referral_reward_config"].map((t) => [t, fakeDb.dump(t)])),
      referral_rewards: [
        { id: "rw1", referral_id: "ref1", user_id: "referrer_1", reward_type: "credit", status: "claimed", amount: 1500, remaining_amount: 0, issued_at: "2026-01-01T00:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z" },
      ],
      referral_credit_applications: [
        { id: "rca_1", reward_id: "rw1", user_id: "referrer_1", payment_id: "pay_1", order_id: "order_1", amount: 800, created_at: "2026-01-01T00:00:00.000Z", released_at: null },
        { id: "rca_2", reward_id: "rw1", user_id: "referrer_1", payment_id: "pay_2", order_id: "order_2", amount: 700, created_at: "2026-01-02T00:00:00.000Z", released_at: null },
      ],
      payments: [
        { id: "pay_1", user_id: "referrer_1", order_id: "order_1", kind: "order", amount: 0, status: "pending" },
        { id: "pay_2", user_id: "referrer_1", order_id: "order_2", kind: "order", amount: 0, status: "pending" },
      ],
      orders: [
        { id: "order_1", user_id: "referrer_1", price: 800 },
        { id: "order_2", user_id: "referrer_1", price: 700 },
      ],
    });

    await Promise.all([releaseCredit("pay_1"), releaseCredit("pay_2")]);

    // Both restorations must have landed — not 800 or 700, but both.
    expect(fakeDb.dump("referral_rewards")[0].remaining_amount).toBe(1500);
    const applications = fakeDb.dump("referral_credit_applications");
    expect(applications.every((a) => a.released_at !== null)).toBe(true);
  });

  it("releaseCredit is a no-op for a payment with nothing reserved", async () => {
    seedWorld();
    await expect(releaseCredit("pay_never_reserved")).resolves.toBeUndefined();
  });
});

describe("getReferralDashboard", () => {
  it("reflects real counts and available credit, not estimates", async () => {
    seedWorld({ activeQualifyingAction: "first_purchase", milestoneSize: 1, rewardAmount: 1100 });
    await attributeReferralBestEffort("referred_1", "ABCDEFGH");
    await attributeReferralBestEffort("referred_2", "ABCDEFGH");
    await qualifyReferral("referred_1", "first_purchase");

    const dashboard = await getReferralDashboard("referrer_1");
    expect(dashboard.referralCode).toBe("ABCDEFGH");
    expect(dashboard.referralPath).toBe("/ref/ABCDEFGH");
    expect(dashboard.totalReferred).toBe(2);
    expect(dashboard.successfulReferrals).toBe(1);
    expect(dashboard.pendingReferrals).toBe(1);
    expect(dashboard.rewardsEarned).toBe(1);
    expect(dashboard.progressPercent).toBe(50);
    expect(dashboard.availableCredit).toBe(1100);
    expect(dashboard.milestoneSize).toBe(1);
    expect(dashboard.referralsUntilNextReward).toBe(1);
  });

  it("reports how many referrals remain until the next milestone", async () => {
    seedWorld({ activeQualifyingAction: "first_purchase", milestoneSize: 3, rewardAmount: 900 });
    await attributeReferralBestEffort("referred_1", "ABCDEFGH");
    await qualifyReferral("referred_1", "first_purchase");

    const dashboard = await getReferralDashboard("referrer_1");
    expect(dashboard.successfulReferrals).toBe(1);
    expect(dashboard.referralsUntilNextReward).toBe(2);
    expect(dashboard.availableCredit).toBe(0); // no milestone hit yet
  });
});

describe("admin views", () => {
  it("compute overview counts and list relationships from real rows", async () => {
    seedWorld({ activeQualifyingAction: "first_purchase" });
    await attributeReferralBestEffort("referred_1", "ABCDEFGH");
    await attributeReferralBestEffort("referred_2", "ABCDEFGH");
    await qualifyReferral("referred_1", "first_purchase");

    const overview = await getAdminReferralOverview();
    expect(overview.totalReferrals).toBe(2);
    expect(overview.successfulReferrals).toBe(1);
    expect(overview.pendingReferrals).toBe(1);
    expect(overview.rewardsIssued).toBe(1);

    const rows = await listReferralsForAdmin();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.referredUserId === "referred_1")?.referrerName).toBe("Amaka");
  });
});
