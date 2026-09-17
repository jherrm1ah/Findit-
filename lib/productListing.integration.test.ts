import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";

// Exercises the REAL createProduct/updateProduct/getProduct/listProducts
// functions against the fake Supabase client — specifically migration 026's
// new fields and the products/product_images split (image_url stays the
// denormalized cover photo; product_images holds the full ordered set).
// lib/repo.test.ts already covers validateProductInput's pure rules.

const fakeDb: FakeSupabase = createFakeSupabase();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeDb,
}));

process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const { createProduct, updateProduct, getProduct, listProducts, createOrderFromProduct, deleteProduct } = await import("./repo");

function categories() {
  return [{ id: "electronics", label: "Electronics", icon_key: "Package", sort_order: 0, active: true, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" }];
}

beforeEach(() => {
  fakeDb.reset({ categories: categories() });
});

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    category: "electronics",
    name: "USB-C cable",
    price: 2500,
    seller: "Terra Gadgets",
    sellerId: null,
    condition: "New" as const,
    deliveryOption: "Delivery" as const,
    ...overrides,
  };
}

describe("createProduct — migration 026 fields", () => {
  it("stores every new field and defaults qty to 1", async () => {
    const product = await createProduct(baseInput({ description: "Brand new, sealed.", color: "Black" }));

    expect(product.description).toBe("Brand new, sealed.");
    expect(product.condition).toBe("New");
    expect(product.deliveryOption).toBe("Delivery");
    expect(product.color).toBe("Black");
    expect(product.qty).toBe(1);
    expect(product.variation).toBeNull();
    expect(product.location).toBeNull();
  });

  it("stores up to MAX_PRODUCT_IMAGES photos, cover first, and derives image_url from the first one", async () => {
    const images = ["https://x.test/a.jpg", "https://x.test/b.jpg", "https://x.test/c.jpg"];
    const product = await createProduct(baseInput({ images }));

    expect(product.imageUrl).toBe(images[0]);
    expect(product.images).toEqual(images);

    const rows = fakeDb.dump("product_images");
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.url)).toEqual(images);
  });

  it("creates a listing with no photos at all", async () => {
    const product = await createProduct(baseInput());
    expect(product.imageUrl).toBeNull();
    expect(product.images).toEqual([]);
  });

  it("refuses a condition outside New/Used even if TypeScript is bypassed", async () => {
    // baseInput's overrides are untyped (Record<string, unknown>), same as a
    // route forwarding a JSON body straight through — this is exactly the
    // boundary validateProductInput's runtime check exists to guard.
    await expect(createProduct(baseInput({ condition: "Refurbished" }))).rejects.toThrow(/condition/i);
  });
});

describe("updateProduct — replacing photos and fields", () => {
  it("replaces the whole photo set and updates the cover", async () => {
    const created = await createProduct(baseInput({ images: ["https://x.test/a.jpg", "https://x.test/b.jpg"] }));

    const updated = await updateProduct(created.id, { images: ["https://x.test/c.jpg"] });

    expect(updated?.images).toEqual(["https://x.test/c.jpg"]);
    expect(updated?.imageUrl).toBe("https://x.test/c.jpg");
    expect(fakeDb.dump("product_images")).toHaveLength(1);
  });

  it("clearing images leaves the listing with a category-icon fallback, not a stale cover", async () => {
    const created = await createProduct(baseInput({ images: ["https://x.test/a.jpg"] }));

    const updated = await updateProduct(created.id, { images: [] });

    expect(updated?.imageUrl).toBeNull();
    expect(updated?.images).toEqual([]);
  });

  it("leaves photos untouched when the patch doesn't mention images", async () => {
    const created = await createProduct(baseInput({ images: ["https://x.test/a.jpg"] }));

    const updated = await updateProduct(created.id, { price: 3000 });

    expect(updated?.images).toEqual(["https://x.test/a.jpg"]);
    expect(updated?.price).toBe(3000);
  });

  it("updates condition/qty/location/deliveryOption/color/variation independently", async () => {
    const created = await createProduct(baseInput());

    const updated = await updateProduct(created.id, {
      condition: "Used",
      qty: 0,
      location: "Yaba, Lagos",
      deliveryOption: "Pickup",
      color: "Red",
      variation: "Large",
    });

    expect(updated).toMatchObject({
      condition: "Used",
      qty: 0,
      location: "Yaba, Lagos",
      deliveryOption: "Pickup",
      color: "Red",
      variation: "Large",
    });
  });
});

describe("listProducts — bulk photo loading", () => {
  it("attaches each product's own photos, never another product's", async () => {
    const a = await createProduct(baseInput({ name: "Cable A", images: ["https://x.test/a1.jpg", "https://x.test/a2.jpg"] }));
    const b = await createProduct(baseInput({ name: "Cable B", images: ["https://x.test/b1.jpg"] }));

    const products = await listProducts();

    const found = new Map(products.map((p) => [p.id, p]));
    expect(found.get(a.id)?.images).toEqual(["https://x.test/a1.jpg", "https://x.test/a2.jpg"]);
    expect(found.get(b.id)?.images).toEqual(["https://x.test/b1.jpg"]);
  });
});

// Migration 027 — moderation_rules checked on every create/update. Real
// rows in the moderation_rules table, exercised through the actual
// createProduct/updateProduct rather than testing findMatchingModerationRule
// in isolation again (that's lib/moderationRules.test.ts).
describe("createProduct/updateProduct — moderation rules (migration 027)", () => {
  function seedWithRule(rule: Record<string, unknown>) {
    fakeDb.reset({ categories: categories(), moderation_rules: [{ id: "mr_1", active: true, ...rule }] });
  }

  it("refuses a listing that matches a 'block' rule", async () => {
    seedWithRule({ keyword: "firearm", reason: "Weapons aren't allowed on FindIt.", severity: "block" });
    await expect(createProduct(baseInput({ name: "Replica firearm toy" }))).rejects.toThrow(/weapons/i);
  });

  it("creates a listing matching a 'flag' rule, but queues it for review", async () => {
    seedWithRule({ keyword: "replica", reason: "Possible counterfeit.", severity: "flag" });
    const product = await createProduct(baseInput({ name: "Replica watch" }));
    expect(product.moderationStatus).toBe("under_review");
    expect(product.moderationReason).toBe("Possible counterfeit.");
  });

  it("leaves an ordinary listing active with no moderation rules in play", async () => {
    seedWithRule({ keyword: "replica", reason: "Possible counterfeit.", severity: "flag" });
    const product = await createProduct(baseInput({ name: "USB-C cable" }));
    expect(product.moderationStatus).toBe("active");
    expect(product.moderationReason).toBeNull();
  });

  it("checks the description too, not just the name", async () => {
    seedWithRule({ keyword: "counterfeit", reason: "Flagged for review.", severity: "flag" });
    const product = await createProduct(baseInput({ name: "Sneakers", description: "definitely not counterfeit, promise" }));
    expect(product.moderationStatus).toBe("under_review");
  });

  it("re-checks on update and refuses an edit that introduces a blocked keyword", async () => {
    seedWithRule({ keyword: "firearm", reason: "Weapons aren't allowed.", severity: "block" });
    const product = await createProduct(baseInput());
    await expect(updateProduct(product.id, { name: "USB-C cable firearm adapter" })).rejects.toThrow(/weapons/i);
  });

  it("never resets a listing an admin already removed just because an unrelated field (price) changes", async () => {
    seedWithRule({ keyword: "cable", reason: "Flagged for review.", severity: "flag" });
    const product = await createProduct(baseInput({ name: "Plain charger" })); // active, no rule match
    // Simulate an admin's own decision (lib/productReports.ts#moderateProduct
    // writes these same three columns) — updateProduct must never touch
    // them on a patch that isn't editing name/description.
    fakeDb.reset({
      categories: categories(),
      moderation_rules: [{ id: "mr_1", active: true, keyword: "cable", reason: "Flagged for review.", severity: "flag" }],
      products: fakeDb.dump("products").map((p) =>
        p.id === product.id ? { ...p, moderation_status: "removed", moderation_reason: "Prohibited item.", moderated_by: "admin_1" } : p
      ),
      product_images: fakeDb.dump("product_images"),
    });

    const updated = await updateProduct(product.id, { price: 3000 });
    expect(updated?.moderationStatus).toBe("removed");
    expect(updated?.moderationReason).toBe("Prohibited item.");
    expect(updated?.price).toBe(3000);
  });
});

describe("createOrderFromProduct — refuses an out-of-stock listing", () => {
  it("refuses to order a listing explicitly marked qty 0", async () => {
    fakeDb.reset({
      categories: categories(),
      users: [{ id: "buyer_1", phone: "+2348012340001", name: "Buyer", role: "buyer", notifications_enabled: true }],
    });
    const product = await createProduct(baseInput({ qty: 0 }));

    await expect(createOrderFromProduct(product.id, 1, "buyer_1")).rejects.toThrow(/out of stock/i);
  });

  it("still allows ordering a listing with real stock", async () => {
    fakeDb.reset({
      categories: categories(),
      users: [{ id: "buyer_1", phone: "+2348012340001", name: "Buyer", role: "buyer", notifications_enabled: true }],
    });
    const product = await createProduct(baseInput({ qty: 3 }));

    const order = await createOrderFromProduct(product.id, 1, "buyer_1");
    expect(order.item).toBe(product.name);
  });
});

describe("deleteProduct — blocks a seller from destroying evidence under review", () => {
  it("refuses a seller's delete while the listing is under review", async () => {
    const product = await createProduct(baseInput());
    fakeDb.reset({
      categories: categories(),
      products: fakeDb.dump("products").map((p) =>
        p.id === product.id ? { ...p, moderation_status: "under_review" } : p
      ),
      product_images: fakeDb.dump("product_images"),
    });

    await expect(deleteProduct(product.id, null)).rejects.toThrow(/under review/i);
    expect(await getProduct(product.id)).not.toBeNull();
  });

  it("still lets an admin delete a listing under review", async () => {
    const product = await createProduct(baseInput());
    fakeDb.reset({
      categories: categories(),
      products: fakeDb.dump("products").map((p) =>
        p.id === product.id ? { ...p, moderation_status: "under_review" } : p
      ),
      product_images: fakeDb.dump("product_images"),
    });

    const deleted = await deleteProduct(product.id, "admin_1");
    expect(deleted).toBe(true);
    expect(await getProduct(product.id)).toBeNull();
  });

  it("lets a seller delete a normal active listing with no restriction", async () => {
    const product = await createProduct(baseInput());

    const deleted = await deleteProduct(product.id, null);
    expect(deleted).toBe(true);
    expect(await getProduct(product.id)).toBeNull();
  });
});
