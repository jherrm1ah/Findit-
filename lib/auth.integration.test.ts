import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";

// Exercises the REAL suspendUser against the fake Supabase client. Covers
// the admin-role guard added this session: the route only requires the
// "users" AdminPermission domain (which support_admin holds, for
// legitimate account-help lookups), so without a second check here a
// support_admin could suspend ANY other admin's account — including a
// super_admin's — the same unauthorized-takedown risk promoting/demoting
// an admin is already restricted to super_admin-only for.

const fakeDb: FakeSupabase = createFakeSupabase();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeDb,
}));

process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const { suspendUser } = await import("./auth");
const { ValidationError } = await import("./errors");

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: "u_target",
    phone: "+2348000000000",
    name: "Some Account",
    role: "buyer",
    admin_role: null,
    suspended: false,
    ...overrides,
  };
}

beforeEach(() => {
  fakeDb.reset({ users: [] });
});

describe("suspendUser", () => {
  it("suspends a buyer account, from any admin permission level", async () => {
    fakeDb.reset({ users: [user()] });
    const result = await suspendUser("u_target", "Repeated scam reports", "acting_admin", "support_admin");
    expect(result.suspended).toBe(true);
    expect(result.suspendedReason).toBe("Repeated scam reports");
  });

  it("refuses a non-super-admin suspending an admin account", async () => {
    fakeDb.reset({ users: [user({ id: "u_target", role: "admin", admin_role: "finance_admin" })] });
    await expect(
      suspendUser("u_target", "reason", "acting_admin", "support_admin")
    ).rejects.toThrow(/only a super admin/i);
    expect(fakeDb.dump("users")[0].suspended).toBe(false);
  });

  it("refuses even a moderation_admin suspending another admin", async () => {
    fakeDb.reset({ users: [user({ id: "u_target", role: "admin", admin_role: "support_admin" })] });
    await expect(
      suspendUser("u_target", "reason", "acting_admin", "moderation_admin")
    ).rejects.toThrow(ValidationError);
  });

  it("lets a super_admin suspend another admin", async () => {
    fakeDb.reset({ users: [user({ id: "u_target", role: "admin", admin_role: "finance_admin" })] });
    const result = await suspendUser("u_target", "Compromised account", "acting_admin", "super_admin");
    expect(result.suspended).toBe(true);
  });

  it("still blocks self-suspension regardless of role", async () => {
    fakeDb.reset({ users: [user({ id: "acting_admin", role: "admin", admin_role: "super_admin" })] });
    await expect(
      suspendUser("acting_admin", "reason", "acting_admin", "super_admin")
    ).rejects.toThrow(/own account/i);
  });

  it("still requires a non-empty reason", async () => {
    fakeDb.reset({ users: [user()] });
    await expect(suspendUser("u_target", "   ", "acting_admin", "support_admin")).rejects.toThrow(ValidationError);
  });
});
