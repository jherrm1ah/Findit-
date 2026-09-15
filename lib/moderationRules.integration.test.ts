import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";

// Exercises the REAL listActiveModerationRules/listAllModerationRulesForAdmin/
// createModerationRule/updateModerationRule against the fake Supabase client
// — same pattern as lib/productListing.integration.test.ts. The pure
// matching logic (findMatchingModerationRule) is covered in
// lib/moderationRules.test.ts.

const fakeDb: FakeSupabase = createFakeSupabase();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeDb,
}));

process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const {
  listActiveModerationRules,
  listAllModerationRulesForAdmin,
  createModerationRule,
  updateModerationRule,
} = await import("./moderationRules");

beforeEach(() => {
  fakeDb.reset();
});

describe("createModerationRule", () => {
  it("creates an active rule by default", async () => {
    const rule = await createModerationRule({ keyword: "replica", reason: "Not allowed.", severity: "flag" });
    expect(rule.keyword).toBe("replica");
    expect(rule.active).toBe(true);
  });

  it("rejects an empty keyword or reason", async () => {
    await expect(createModerationRule({ keyword: "  ", reason: "x", severity: "flag" })).rejects.toThrow(/keyword/i);
    await expect(createModerationRule({ keyword: "x", reason: "  ", severity: "flag" })).rejects.toThrow(/reason/i);
  });

  it("rejects a severity outside flag/block even if TypeScript is bypassed", async () => {
    await expect(
      createModerationRule({ keyword: "x", reason: "y", severity: "delete" as unknown as "flag" })
    ).rejects.toThrow(/severity/i);
  });
});

describe("listActiveModerationRules vs listAllModerationRulesForAdmin", () => {
  it("active-only excludes a rule an admin deactivated; the admin list still shows it", async () => {
    const created = await createModerationRule({ keyword: "fake", reason: "x", severity: "flag" });
    await updateModerationRule(created.id, { active: false });

    const active = await listActiveModerationRules();
    const all = await listAllModerationRulesForAdmin();
    expect(active.find((r) => r.id === created.id)).toBeUndefined();
    expect(all.find((r) => r.id === created.id)).toBeDefined();
  });
});

describe("updateModerationRule", () => {
  it("updates keyword/reason/severity/active independently", async () => {
    const created = await createModerationRule({ keyword: "x", reason: "y", severity: "flag" });
    const updated = await updateModerationRule(created.id, { severity: "block", reason: "Now blocked outright." });
    expect(updated.severity).toBe("block");
    expect(updated.reason).toBe("Now blocked outright.");
    expect(updated.keyword).toBe("x");
  });

  it("throws for a rule that doesn't exist", async () => {
    await expect(updateModerationRule("nope", { active: false })).rejects.toThrow(/doesn't exist/i);
  });

  it("throws when the patch has no editable fields", async () => {
    const created = await createModerationRule({ keyword: "x", reason: "y", severity: "flag" });
    await expect(updateModerationRule(created.id, {})).rejects.toThrow(/no editable fields/i);
  });
});
