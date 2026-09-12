import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";

// The public seller storefront is the one read path on this platform with no
// authentication in front of it, so what it returns is the whole security
// boundary. These tests exist mostly to prove what does NOT come back.

const fakeDb: FakeSupabase = createFakeSupabase();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeDb,
}));

process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const { getPublicSellerProfile } = await import("./sellerPublicProfile");
const { listPublicProductsForSeller } = await import("./repo");

const listings = (seller: { id: string | null; name: string }) => listPublicProductsForSeller(seller);

// Every private column that actually exists on the sellers table. If one of
// these ever appears in the response, a buyer is reading a seller's banking
// details or an admin's private notes.
const PRIVATE_SELLER_FIELDS = [
  "user_id",
  "userId",
  "bank_account_number",
  "bankAccountNumber",
  "bank_code",
  "bankCode",
  "bank_account_name",
  "bankAccountName",
  "paystack_recipient_code",
  "paystackRecipientCode",
  "status",
  "status_reason",
  "statusReason",
  "verification_status",
  "verificationStatus",
  "verification_rejection_reason",
  "verificationRejectionReason",
  "verification_reviewed_by",
  "verificationReviewedBy",
  "social_links",
  "socialLinks",
  "phone",
];

function seedSeller(overrides: Record<string, unknown> = {}) {
  return {
    id: "seller_1",
    user_id: "u_1",
    name: "Terra Gadgets",
    status: "approved",
    status_reason: null,
    logo_url: null,
    banner_url: null,
    seller_type: "online",
    category: "Electronics",
    description: "Phone accessories, Lagos mainland.",
    years_selling: "2-5",
    social_links: { whatsapp: "08012345678" },
    has_physical_store: false,
    public_state: "Lagos",
    public_city: "Ikeja",
    public_area: null,
    verification_status: "approved",
    verification_rejection_reason: "an admin's private note",
    verification_reviewed_by: "admin_1",
    bank_account_number: "0123456789",
    bank_code: "058",
    bank_account_name: "Terra Gadgets Ltd",
    paystack_recipient_code: "RCP_secret",
    created_at: "2026-01-15T00:00:00.000Z",
    ...overrides,
  };
}

function seedProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "p_1",
    category: "Electronics",
    name: "USB-C cable",
    price: 2500,
    seller: "Terra Gadgets",
    seller_id: "seller_1",
    image_url: null,
    art: 0,
    lat: null,
    lng: null,
    active: true,
    boosted_until: null,
    created_at: "2026-02-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  fakeDb.reset();
});

describe("public seller profile — what it returns", () => {
  it("returns the storefront for an approved seller", async () => {
    fakeDb.reset({ sellers: [seedSeller()], products: [seedProduct()] });

    const result = await getPublicSellerProfile("seller_1", listings);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.profile.name).toBe("Terra Gadgets");
    expect(result.profile.description).toBe("Phone accessories, Lagos mainland.");
    expect(result.profile.location).toBe("Ikeja, Lagos");
    expect(result.profile.listings.map((p) => p.id)).toEqual(["p_1"]);
  });

  it("leaks no private seller field, at the top level or inside a listing", async () => {
    fakeDb.reset({ sellers: [seedSeller()], products: [seedProduct()] });

    const result = await getPublicSellerProfile("seller_1", listings);
    if (result.status !== "ok") throw new Error("expected a profile");

    const serialised = JSON.stringify(result.profile);
    for (const field of PRIVATE_SELLER_FIELDS) {
      expect(Object.keys(result.profile)).not.toContain(field);
    }
    // The values themselves must not appear anywhere in the payload either,
    // including nested inside a listing.
    expect(serialised).not.toContain("0123456789");
    expect(serialised).not.toContain("RCP_secret");
    expect(serialised).not.toContain("an admin's private note");
    expect(serialised).not.toContain("admin_1");
    expect(serialised).not.toContain("u_1");
  });

  it("still returns a profile for a seller with no listings at all", async () => {
    // The old client-side screen rendered completely blank here, because
    // every field was read off the first listing.
    fakeDb.reset({ sellers: [seedSeller()], products: [] });

    const result = await getPublicSellerProfile("seller_1", listings);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.profile.name).toBe("Terra Gadgets");
    expect(result.profile.listings).toEqual([]);
  });

  it("hides a listing that a plan downgrade deactivated", async () => {
    fakeDb.reset({
      sellers: [seedSeller()],
      products: [seedProduct(), seedProduct({ id: "p_2", name: "Hidden charger", active: false })],
    });

    const result = await getPublicSellerProfile("seller_1", listings);
    if (result.status !== "ok") throw new Error("expected a profile");

    expect(result.profile.listings.map((p) => p.id)).toEqual(["p_1"]);
  });
});

describe("public seller profile — visibility rules", () => {
  it("answers not_found for an unknown seller", async () => {
    fakeDb.reset({ sellers: [seedSeller()] });
    expect((await getPublicSellerProfile("seller_nope", listings)).status).toBe("not_found");
  });

  it("answers not_found for an empty key rather than matching something", async () => {
    fakeDb.reset({ sellers: [seedSeller()] });
    expect((await getPublicSellerProfile("   ", listings)).status).toBe("not_found");
  });

  it("hides a suspended seller's storefront", async () => {
    fakeDb.reset({ sellers: [seedSeller({ status: "suspended" })], products: [seedProduct()] });
    // Same answer as a seller who never existed — a buyer has no business
    // learning that this specific account was punished.
    expect((await getPublicSellerProfile("seller_1", listings)).status).toBe("not_found");
  });

  it("hides a rejected seller's storefront", async () => {
    fakeDb.reset({ sellers: [seedSeller({ status: "rejected" })] });
    expect((await getPublicSellerProfile("seller_1", listings)).status).toBe("not_found");
  });

  it("still shows a pending seller, who is a real account with nothing to sell", async () => {
    fakeDb.reset({ sellers: [seedSeller({ status: "pending", verification_status: "incomplete" })] });

    const result = await getPublicSellerProfile("seller_1", listings);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    // Never claims a level FindIt hasn't actually reviewed.
    expect(result.profile.verificationLevel).toBe("new");
  });
});

describe("public seller profile — two sellers, one business name", () => {
  function seedNameCollision() {
    fakeDb.reset({
      sellers: [
        seedSeller({ id: "seller_1", name: "Shopera" }),
        seedSeller({ id: "seller_2", user_id: "u_2", name: "Shopera" }),
      ],
      products: [
        seedProduct({ id: "p_1", seller: "Shopera", seller_id: "seller_1" }),
        seedProduct({ id: "p_2", seller: "Shopera", seller_id: "seller_2" }),
      ],
    });
  }

  it("never pools two same-named sellers' listings into one storefront", async () => {
    seedNameCollision();

    const result = await getPublicSellerProfile("seller_1", listings);
    if (result.status !== "ok") throw new Error("expected a profile");

    expect(result.profile.listings.map((p) => p.id)).toEqual(["p_1"]);
  });

  it("refuses a name-keyed lookup when the name maps to two accounts", async () => {
    seedNameCollision();

    const result = await getPublicSellerProfile("Shopera", listings);

    expect(result.status).toBe("ambiguous");
    if (result.status !== "ambiguous") return;
    expect(result.candidateSellerIds.sort()).toEqual(["seller_1", "seller_2"]);
  });

  it("resolves a name-keyed lookup when the name is unique", async () => {
    fakeDb.reset({ sellers: [seedSeller()], products: [seedProduct()] });

    const result = await getPublicSellerProfile("Terra Gadgets", listings);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.profile.id).toBe("seller_1");
  });

  it("still attributes a pre-backfill listing with no seller_id by name", async () => {
    fakeDb.reset({
      sellers: [seedSeller()],
      products: [seedProduct({ id: "p_legacy", seller_id: null })],
    });

    const result = await getPublicSellerProfile("seller_1", listings);
    if (result.status !== "ok") throw new Error("expected a profile");

    expect(result.profile.listings.map((p) => p.id)).toEqual(["p_legacy"]);
  });
});

describe("public seller profile — reputation is computed, never declared", () => {
  it("averages only reviewed orders and counts only released ones", async () => {
    fakeDb.reset({
      sellers: [seedSeller()],
      orders: [
        { id: "o_1", seller: "Terra Gadgets", reviewed: true, my_rating: 5, escrow_status: "released" },
        { id: "o_2", seller: "Terra Gadgets", reviewed: true, my_rating: 4, escrow_status: "released" },
        // Completed but never reviewed — counts toward the order total, not
        // the rating.
        { id: "o_3", seller: "Terra Gadgets", reviewed: false, my_rating: null, escrow_status: "released" },
        // Another seller's order must not bleed in.
        { id: "o_4", seller: "Someone Else", reviewed: true, my_rating: 1, escrow_status: "released" },
      ],
    });

    const result = await getPublicSellerProfile("seller_1", listings);
    if (result.status !== "ok") throw new Error("expected a profile");

    expect(result.profile.rating).toBe(4.5);
    expect(result.profile.reviewCount).toBe(2);
    expect(result.profile.completedOrderCount).toBe(3);
  });
});
