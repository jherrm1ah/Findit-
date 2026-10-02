import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";

// Exercises the REAL activateAdCampaign/takeDownAdCampaign against the fake
// Supabase client — same reasoning as lib/boosts.integration.test.ts.
// Unlike a boost (which extends one shared products.boosted_until and so
// needs a CAS retry dance), each campaign is its own independent row, so
// the idempotency story here is simpler: a plain insert, deduped on
// payment_id (migration 040's partial unique index).

const fakeDb: FakeSupabase = createFakeSupabase();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeDb,
}));

process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const { activateAdCampaign, takeDownAdCampaign, listActiveAdCampaigns, isCampaignActive, validateAdCampaignInput } = await import(
  "./adCampaigns"
);

function seedPlan(overrides: Record<string, unknown> = {}) {
  fakeDb.reset({
    ad_campaign_plans: [{ id: "adplan_7d", name: "7-day Sponsored slide", duration_days: 7, price: 3000, sort_order: 1, active: true, ...overrides }],
  });
}

beforeEach(() => {
  seedPlan();
});

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    sellerId: "seller_1",
    planId: "adplan_7d",
    headline: "Premium Tech at the Best Prices",
    body: "Latest iPhones, Samsung & more. Fast delivery. Trusted sellers.",
    ctaLabel: "Shop now",
    imageUrl: "https://example.local/storage/v1/object/public/product-images/banner.jpg",
    targetProductId: null,
    amount: 3000,
    paymentId: "pay_1",
    ...overrides,
  };
}

describe("activateAdCampaign — idempotent on payment_id", () => {
  it("creates one campaign for a new payment, ending duration_days from now", async () => {
    await activateAdCampaign(baseInput());

    const campaigns = fakeDb.dump("ad_campaigns");
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0].payment_id).toBe("pay_1");
    expect(campaigns[0].headline).toBe("Premium Tech at the Best Prices");

    const days = (new Date(campaigns[0].ends_at as string).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it("is a no-op on a second call for the same payment (a redelivered webhook)", async () => {
    await activateAdCampaign(baseInput());
    await activateAdCampaign(baseInput());

    expect(fakeDb.dump("ad_campaigns")).toHaveLength(1);
  });

  it("creates a second, independent campaign for a genuinely different payment", async () => {
    await activateAdCampaign(baseInput({ paymentId: "pay_1" }));
    await activateAdCampaign(baseInput({ paymentId: "pay_2", headline: "A second campaign" }));

    expect(fakeDb.dump("ad_campaigns")).toHaveLength(2);
  });

  it("only creates one campaign when two overlapping calls race for the same payment", async () => {
    await Promise.all([
      activateAdCampaign(baseInput({ paymentId: "pay_race" })),
      activateAdCampaign(baseInput({ paymentId: "pay_race" })),
    ]);

    expect(fakeDb.dump("ad_campaigns")).toHaveLength(1);
  });
});

describe("listActiveAdCampaigns", () => {
  it("returns only campaigns whose ends_at is still in the future", async () => {
    fakeDb.reset({
      ad_campaign_plans: [{ id: "adplan_7d", name: "7-day", duration_days: 7, price: 3000, sort_order: 1, active: true }],
      ad_campaigns: [
        { id: "camp_live", seller_id: "seller_1", plan_id: "adplan_7d", headline: "Still live", body: "b", cta_label: "Shop", image_url: "u", amount: 3000, ends_at: new Date(Date.now() + 86400000).toISOString(), created_at: new Date(Date.now() - 1000).toISOString() },
        { id: "camp_ended", seller_id: "seller_1", plan_id: "adplan_7d", headline: "Already ended", body: "b", cta_label: "Shop", image_url: "u", amount: 3000, ends_at: new Date(Date.now() - 86400000).toISOString(), created_at: new Date(Date.now() - 2000).toISOString() },
      ],
    });

    const active = await listActiveAdCampaigns();
    expect(active.map((c) => c.id)).toEqual(["camp_live"]);
  });
});

describe("takeDownAdCampaign", () => {
  it("ends the campaign immediately and records why", async () => {
    fakeDb.reset({
      ad_campaign_plans: [{ id: "adplan_7d", name: "7-day", duration_days: 7, price: 3000, sort_order: 1, active: true }],
      ad_campaigns: [
        { id: "camp_1", seller_id: "seller_1", plan_id: "adplan_7d", headline: "Headline", body: "b", cta_label: "Shop", image_url: "u", amount: 3000, ends_at: new Date(Date.now() + 86400000).toISOString(), created_at: new Date().toISOString() },
      ],
    });

    const result = await takeDownAdCampaign("camp_1", "Misleading pricing claim");
    expect(result).not.toBeNull();
    expect(isCampaignActive(result!.endsAt)).toBe(false);
    expect(result!.takenDownReason).toBe("Misleading pricing claim");

    // listActiveAdCampaigns must no longer return it.
    expect((await listActiveAdCampaigns()).find((c) => c.id === "camp_1")).toBeUndefined();
  });

  it("returns null for a campaign that doesn't exist", async () => {
    fakeDb.reset({ ad_campaign_plans: [], ad_campaigns: [] });
    expect(await takeDownAdCampaign("nope", null)).toBeNull();
  });
});

describe("isCampaignActive — pure", () => {
  it("is true when ends_at is in the future", () => {
    expect(isCampaignActive(new Date(Date.now() + 1000).toISOString())).toBe(true);
  });
  it("is false when ends_at is in the past", () => {
    expect(isCampaignActive(new Date(Date.now() - 1000).toISOString())).toBe(false);
  });
});

describe("validateAdCampaignInput", () => {
  it("accepts a well-formed submission", () => {
    expect(() => validateAdCampaignInput({ headline: "Headline", body: "Body text", ctaLabel: "Shop now" })).not.toThrow();
  });
  it("rejects an empty headline", () => {
    expect(() => validateAdCampaignInput({ headline: "  ", body: "Body text", ctaLabel: "Shop now" })).toThrow();
  });
  it("rejects a headline over the length limit", () => {
    expect(() => validateAdCampaignInput({ headline: "x".repeat(61), body: "Body text", ctaLabel: "Shop now" })).toThrow();
  });
  it("rejects an empty body", () => {
    expect(() => validateAdCampaignInput({ headline: "Headline", body: " ", ctaLabel: "Shop now" })).toThrow();
  });
  it("rejects an empty cta label", () => {
    expect(() => validateAdCampaignInput({ headline: "Headline", body: "Body text", ctaLabel: " " })).toThrow();
  });
});
