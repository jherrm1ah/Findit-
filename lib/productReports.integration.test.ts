import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";

// Exercises the REAL reportProduct/listOpenProductReportsForAdmin/
// resolveProductReport/moderateProduct/countFlaggedProducts/
// countOpenProductReports against the fake Supabase client — same pattern
// as lib/productListing.integration.test.ts. Note: the fake client doesn't
// support PostgREST's embedded-resource select ("*, products(name)"), so
// listOpenProductReportsForAdmin's joined productName/reporterName fields
// aren't exercised here — only the report row itself, which is real logic
// the fake DOES support.

const fakeDb: FakeSupabase = createFakeSupabase();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeDb,
}));

process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const {
  reportProduct,
  listOpenProductReportsForAdmin,
  resolveProductReport,
  moderateProduct,
  countFlaggedProducts,
  countOpenProductReports,
} = await import("./productReports");

function seedProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "p_1",
    name: "USB-C cable",
    seller: "Terra Gadgets",
    image_url: null,
    moderation_status: "active",
    moderation_reason: null,
    ...overrides,
  };
}

beforeEach(() => {
  fakeDb.reset({ products: [seedProduct()], users: [{ id: "buyer_1", name: "Ada", phone: "+2348012340001" }] });
});

describe("reportProduct", () => {
  it("files a report and escalates an active listing to under_review", async () => {
    const report = await reportProduct({ productId: "p_1", reporterId: "buyer_1", reason: "scam" });
    expect(report.status).toBe("open");
    expect(report.reason).toBe("scam");

    const [product] = fakeDb.dump("products");
    expect(product.moderation_status).toBe("under_review");
    expect(product.moderation_reason).toMatch(/scam/i);
  });

  it("refuses an invalid reason", async () => {
    await expect(
      reportProduct({ productId: "p_1", reporterId: "buyer_1", reason: "annoying" as unknown as "other" })
    ).rejects.toThrow(/valid reason/i);
  });

  it("refuses to report a listing that doesn't exist", async () => {
    await expect(reportProduct({ productId: "nope", reporterId: "buyer_1", reason: "spam" })).rejects.toThrow(/doesn't exist/i);
  });

  it("refuses a second open report from the same reporter on the same listing", async () => {
    await reportProduct({ productId: "p_1", reporterId: "buyer_1", reason: "spam" });
    await expect(reportProduct({ productId: "p_1", reporterId: "buyer_1", reason: "scam" })).rejects.toThrow(/already reported/i);
  });

  it("never downgrades a listing an admin already removed", async () => {
    fakeDb.reset({
      products: [seedProduct({ moderation_status: "removed", moderation_reason: "Prohibited item." })],
      users: [{ id: "buyer_1", name: "Ada", phone: "+2348012340001" }],
    });
    await reportProduct({ productId: "p_1", reporterId: "buyer_1", reason: "scam" });
    const [product] = fakeDb.dump("products");
    expect(product.moderation_status).toBe("removed");
    expect(product.moderation_reason).toBe("Prohibited item.");
  });
});

describe("resolveProductReport", () => {
  it("resolves an open report and records who resolved it", async () => {
    const report = await reportProduct({ productId: "p_1", reporterId: "buyer_1", reason: "spam" });
    const resolved = await resolveProductReport(report.id, "admin_1", "dismissed", "Not actually spam.");
    expect(resolved?.status).toBe("dismissed");
    expect(resolved?.resolvedBy).toBe("admin_1");
    expect(resolved?.resolutionNote).toBe("Not actually spam.");
  });

  it("throws when resolving a report that's already resolved", async () => {
    const report = await reportProduct({ productId: "p_1", reporterId: "buyer_1", reason: "spam" });
    await resolveProductReport(report.id, "admin_1", "dismissed");
    await expect(resolveProductReport(report.id, "admin_1", "resolved")).rejects.toThrow(/already been resolved/i);
  });

  it("only ever leaves open reports in listOpenProductReportsForAdmin", async () => {
    const a = await reportProduct({ productId: "p_1", reporterId: "buyer_1", reason: "spam" });
    await resolveProductReport(a.id, "admin_1", "dismissed");
    const open = await listOpenProductReportsForAdmin();
    expect(open.find((r) => r.id === a.id)).toBeUndefined();
  });
});

describe("moderateProduct", () => {
  it("removes a listing with a reason and records the acting admin", async () => {
    const result = await moderateProduct("admin_1", "p_1", "removed", "Counterfeit goods.");
    expect(result?.moderationStatus).toBe("removed");
    expect(result?.moderationReason).toBe("Counterfeit goods.");
    const [product] = fakeDb.dump("products");
    expect(product.moderated_by).toBe("admin_1");
    expect(product.moderated_at).toBeTruthy();
  });

  it("requires a reason for anything other than 'active'", async () => {
    await expect(moderateProduct("admin_1", "p_1", "removed")).rejects.toThrow(/reason is required/i);
    await expect(moderateProduct("admin_1", "p_1", "under_review")).rejects.toThrow(/reason is required/i);
  });

  it("clears the reason when restoring to active", async () => {
    await moderateProduct("admin_1", "p_1", "removed", "Prohibited item.");
    const restored = await moderateProduct("admin_1", "p_1", "active");
    expect(restored?.moderationReason).toBeNull();
  });

  it("returns null for a listing that doesn't exist", async () => {
    expect(await moderateProduct("admin_1", "nope", "removed", "x")).toBeNull();
  });
});

describe("counts for the admin overview", () => {
  it("counts flagged (under_review) products and open reports independently", async () => {
    await reportProduct({ productId: "p_1", reporterId: "buyer_1", reason: "spam" });
    expect(await countFlaggedProducts()).toBe(1);
    expect(await countOpenProductReports()).toBe(1);

    await moderateProduct("admin_1", "p_1", "active");
    expect(await countFlaggedProducts()).toBe(0);
    // Resolving the product doesn't silently resolve the report that
    // prompted it — that's still a separate admin decision (see the
    // module comment in lib/productReports.ts).
    expect(await countOpenProductReports()).toBe(1);
  });
});
