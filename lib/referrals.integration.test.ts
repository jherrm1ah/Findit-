import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";

// The guarantees that actually matter here: a referral can't be self-made,
// an account can only ever be attributed once, qualifying only happens for
// the currently-active action, and qualifying is idempotent (calling it
// again for an already-qualified referral must not create a second
// reward) — exactly the anti-abuse properties the referral system exists
// to enforce, exercised against real lib/referrals.ts logic rather than
// reimplemented test-only versions of it.

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
  getReferralDashboard,
  getAdminReferralOverview,
  listReferralsForAdmin,
} = await import("./referrals");

function seedWorld(overrides: { activeQualifyingAction?: string } = {}) {
  fakeDb.reset({
    users: [
      { id: "referrer_1", name: "Amaka", notifications_enabled: true, referral_code: "ABCDEFGH" },
      { id: "referred_1", name: "Bello", notifications_enabled: true },
      { id: "referred_2", name: "Chidi", notifications_enabled: true },
    ],
    referral_settings: [
      {
        id: "rs_default",
        active_qualifying_action: overrides.activeQualifyingAction ?? "first_purchase",
        created_by: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    referrals: [],
    referral_rewards: [],
    notifications: [],
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
      referrals: [
        { id: "ref_existing", referrer_user_id: "referrer_1", referred_user_id: "referred_1", referral_code: "ABCDEFGH", status: "pending", reward_status: "none", created_at: "2026-01-01T00:00:00.000Z" },
      ],
    });
    await attributeReferralBestEffort("referred_1", "ABCDEFGH");
    expect(fakeDb.dump("referrals")).toHaveLength(1);
  });
});

describe("qualifyReferral", () => {
  it("qualifies a pending referral when the action matches the active setting", async () => {
    seedWorld({ activeQualifyingAction: "first_purchase" });
    await attributeReferralBestEffort("referred_1", "ABCDEFGH");

    await qualifyReferral("referred_1", "first_purchase");

    const referral = fakeDb.dump("referrals")[0];
    expect(referral.status).toBe("qualified");
    expect(referral.qualifying_action).toBe("first_purchase");
    expect(referral.reward_status).toBe("pending");
    expect(fakeDb.dump("referral_rewards")).toHaveLength(1);
    expect(fakeDb.dump("referral_rewards")[0].user_id).toBe("referrer_1");
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

describe("getReferralDashboard", () => {
  it("reflects real counts, not estimates", async () => {
    seedWorld({ activeQualifyingAction: "first_purchase" });
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
