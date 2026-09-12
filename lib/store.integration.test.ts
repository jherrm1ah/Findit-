import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";

// Store eligibility is a PAID-plan rule, and the URL is the thing customers
// keep. So the cases that matter here are: a free seller must not get one, a
// retried request must not create a second one, two shops with the same name
// must not collide, and a downgrade must close the page without destroying
// the seller's claim on their own link.

const fakeDb: FakeSupabase = createFakeSupabase();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeDb,
}));

process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const { claimStoreSlug, getPublicStoreBySlug, getStoreEligibility, getOwnStoreState, storeUrl } =
  await import("./store");

const PLANS = [
  { id: "store_free", kind: "store", name: "Free Seller", price_monthly: 0, price_yearly: null, product_limit: 5, storage_limit_mb: 100, analytics_level: "none", customization_level: "none", featured_listing_access: false, priority_support: false, pro_badge: false, trial_days: 0, sort_order: 0, active: true },
  { id: "store_business", kind: "store", name: "Business Store", price_monthly: 5000, price_yearly: null, product_limit: 200, storage_limit_mb: 2000, analytics_level: "advanced", customization_level: "advanced", featured_listing_access: true, priority_support: true, pro_badge: false, trial_days: 30, sort_order: 2, active: true },
];

function seller(overrides: Record<string, unknown> = {}) {
  return {
    id: "seller_1",
    user_id: "u_1",
    name: "ABC Electronics",
    status: "approved",
    store_slug: null,
    store_slug_claimed_at: null,
    verification_status: "approved",
    logo_url: null,
    banner_url: null,
    seller_type: null,
    category: null,
    description: null,
    years_selling: null,
    has_physical_store: null,
    public_state: null,
    public_city: null,
    public_area: null,
    social_links: null,
    bank_account_number: "0123456789",
    paystack_recipient_code: "RCP_secret",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function subscription(sellerId: string, planId: string) {
  return {
    id: `sub_${sellerId}`,
    owner_type: "store",
    owner_id: sellerId,
    plan_id: planId,
    status: "active",
    billing_period: "monthly",
    // Far future, so isSubscriptionLapsed leaves it alone.
    current_period_end: "2099-01-01T00:00:00.000Z",
    trial_ends_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function seed(sellers: Record<string, unknown>[], subs: Record<string, unknown>[], extra: Record<string, unknown[]> = {}) {
  fakeDb.reset({ sellers, subscriptions: subs, subscription_plans: PLANS, products: [], ...extra });
}

beforeEach(() => {
  fakeDb.reset();
});

describe("store eligibility — a paid-plan benefit, enforced server-side", () => {
  it("refuses a seller on the free plan", async () => {
    seed([seller()], [subscription("seller_1", "store_free")]);

    const eligibility = await getStoreEligibility("seller_1");

    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toMatch(/paid Store plan/i);
  });

  it("allows a seller on a paid plan", async () => {
    seed([seller()], [subscription("seller_1", "store_business")]);

    expect((await getStoreEligibility("seller_1")).eligible).toBe(true);
  });

  it("will not let a free seller claim a link even by calling the function directly", async () => {
    // The dashboard hides the button. That is not the enforcement.
    seed([seller()], [subscription("seller_1", "store_free")]);

    await expect(claimStoreSlug("seller_1")).rejects.toThrow(/paid Store plan/i);
    expect(fakeDb.dump("sellers")[0].store_slug).toBeNull();
  });
});

describe("claiming a store link", () => {
  it("gives a paid seller a readable slug from their business name", async () => {
    seed([seller()], [subscription("seller_1", "store_business")]);

    const result = await claimStoreSlug("seller_1");

    expect(result).toEqual({ slug: "abc-electronics", created: true });
    expect(fakeDb.dump("sellers")[0].store_slug).toBe("abc-electronics");
  });

  it("is idempotent — a retried request returns the same link, not a second one", async () => {
    seed([seller()], [subscription("seller_1", "store_business")]);

    const first = await claimStoreSlug("seller_1");
    const second = await claimStoreSlug("seller_1");
    const third = await claimStoreSlug("seller_1");

    expect(first).toEqual({ slug: "abc-electronics", created: true });
    expect(second).toEqual({ slug: "abc-electronics", created: false });
    expect(third).toEqual({ slug: "abc-electronics", created: false });
    expect(fakeDb.dump("sellers")).toHaveLength(1);
  });

  it("gives two shops with the same name different links", async () => {
    seed(
      [seller(), seller({ id: "seller_2", user_id: "u_2" })],
      [subscription("seller_1", "store_business"), subscription("seller_2", "store_business")]
    );

    const first = await claimStoreSlug("seller_1");
    const second = await claimStoreSlug("seller_2");

    expect(first.slug).toBe("abc-electronics");
    expect(second.slug).toBe("abc-electronics-2");
    expect(first.slug).not.toBe(second.slug);
  });

  it("never hands out a slug already retired by another store", async () => {
    seed(
      [seller({ name: "Ben Tech" })],
      [subscription("seller_1", "store_business")],
      { store_slug_aliases: [{ slug: "ben-tech", seller_id: "seller_other", created_at: "2026-01-01T00:00:00.000Z" }] }
    );

    const result = await claimStoreSlug("seller_1");

    // An old shared link must never start pointing at a different shop.
    expect(result.slug).not.toBe("ben-tech");
    expect(result.slug).toBe("ben-tech-2");
  });

  it("refuses a seller that doesn't exist", async () => {
    seed([], []);
    await expect(claimStoreSlug("seller_nope")).rejects.toThrow(/not found/i);
  });
});

describe("the public store page", () => {
  async function seedOpenStore(overrides: Record<string, unknown> = {}) {
    seed([seller({ store_slug: "abc-electronics", ...overrides })], [subscription("seller_1", "store_business")]);
  }

  it("opens for anyone, with no session", async () => {
    await seedOpenStore();

    const result = await getPublicStoreBySlug("abc-electronics");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.store.profile.name).toBe("ABC Electronics");
    expect(result.store.planName).toBe("Business Store");
  });

  it("exposes no private seller data", async () => {
    await seedOpenStore();

    const result = await getPublicStoreBySlug("abc-electronics");
    if (result.status !== "ok") throw new Error("expected a store");

    const serialised = JSON.stringify(result.store);
    expect(serialised).not.toContain("0123456789");
    expect(serialised).not.toContain("RCP_secret");
    expect(serialised).not.toContain("u_1");
  });

  it("404s an unknown slug", async () => {
    await seedOpenStore();
    expect((await getPublicStoreBySlug("no-such-store")).status).toBe("not_found");
  });

  it("404s a malformed slug without querying for it", async () => {
    await seedOpenStore();
    for (const bad of ["../../etc", "UPPER", "has space", "a", "double--hyphen"]) {
      expect((await getPublicStoreBySlug(bad)).status).toBe("not_found");
    }
  });

  it("404s a suspended seller's store", async () => {
    seed(
      [seller({ store_slug: "abc-electronics", status: "suspended" })],
      [subscription("seller_1", "store_business")]
    );

    expect((await getPublicStoreBySlug("abc-electronics")).status).toBe("not_found");
  });

  it("closes the page on downgrade but keeps the seller's claim on the link", async () => {
    seed([seller({ store_slug: "abc-electronics" })], [subscription("seller_1", "store_free")]);

    const result = await getPublicStoreBySlug("abc-electronics");

    // Not 'not_found': the store exists, its slug stays reserved, and its
    // data is untouched. It simply isn't open.
    expect(result.status).toBe("unavailable");
    expect(fakeDb.dump("sellers")[0].store_slug).toBe("abc-electronics");
  });

  it("reopens by itself once the plan is restored", async () => {
    seed([seller({ store_slug: "abc-electronics" })], [subscription("seller_1", "store_free")]);
    expect((await getPublicStoreBySlug("abc-electronics")).status).toBe("unavailable");

    fakeDb.reset({
      sellers: [seller({ store_slug: "abc-electronics" })],
      subscriptions: [subscription("seller_1", "store_business")],
      subscription_plans: PLANS,
      products: [],
    });

    expect((await getPublicStoreBySlug("abc-electronics")).status).toBe("ok");
  });

  it("keeps an old shared link working after a rename, and names the current one", async () => {
    seed(
      [seller({ store_slug: "abc-electronics-new" })],
      [subscription("seller_1", "store_business")],
      { store_slug_aliases: [{ slug: "abc-electronics", seller_id: "seller_1", created_at: "2026-01-01T00:00:00.000Z" }] }
    );

    const result = await getPublicStoreBySlug("abc-electronics");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.store.slug).toBe("abc-electronics");
    expect(result.store.canonicalSlug).toBe("abc-electronics-new");
  });
});

describe("the seller's own view", () => {
  it("reports an unclaimed but eligible store", async () => {
    seed([seller()], [subscription("seller_1", "store_business")]);

    const state = await getOwnStoreState("seller_1", "https://findit.example");

    expect(state.slug).toBeNull();
    expect(state.eligible).toBe(true);
    expect(state.claimedButUnavailable).toBe(false);
  });

  it("reports a claimed store that the current plan no longer publishes", async () => {
    seed([seller({ store_slug: "abc-electronics" })], [subscription("seller_1", "store_free")]);

    const state = await getOwnStoreState("seller_1", "https://findit.example");

    expect(state.slug).toBe("abc-electronics");
    expect(state.eligible).toBe(false);
    expect(state.claimedButUnavailable).toBe(true);
    // The seller still sees their link, so they know what they get back.
    expect(state.url).toBe("https://findit.example/store/abc-electronics");
  });
});

describe("storeUrl", () => {
  it("uses the configured origin", () => {
    expect(storeUrl("abc", "https://findit.example")).toBe("https://findit.example/store/abc");
  });

  it("tolerates a trailing slash on the configured origin", () => {
    expect(storeUrl("abc", "https://findit.example/")).toBe("https://findit.example/store/abc");
  });

  it("falls back to a site-relative path rather than inventing a domain", () => {
    const previous = process.env.APP_URL;
    const vercel = process.env.VERCEL_URL;
    delete process.env.APP_URL;
    delete process.env.VERCEL_URL;
    expect(storeUrl("abc", null)).toBe("/store/abc");
    if (previous) process.env.APP_URL = previous;
    if (vercel) process.env.VERCEL_URL = vercel;
  });
});
