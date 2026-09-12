import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";

// Exercises the REAL requireAdmin guard (lib/adminRoles.ts) against an
// in-memory Supabase fake, because this is the gate every single admin route
// depends on. hasAdminPermission is already unit-tested as a pure function in
// adminRoles.test.ts; what this file covers is the part that reads the
// database and can therefore actually be got wrong at runtime: the staff
// sign-in unlock added in migration 020.
//
// The interesting cases are all negative. A guard that lets the right person
// through is worth one test; a guard that lets the WRONG person through is
// the entire reason it exists.

const fakeDb: FakeSupabase = createFakeSupabase();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeDb,
}));

process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const { requireAdmin, requireSuperAdmin, ADMIN_UNLOCK_REQUIRED } = await import("./adminRoles");
const { SESSION_COOKIE } = await import("./auth");

// requireAdmin only ever touches req.cookies.get(...) — building a whole
// NextRequest (which needs a URL, headers, and a body stream) would test
// Next.js, not this guard.
function requestWithSession(token: string | null) {
  return {
    cookies: {
      get: (name: string) => (name === SESSION_COOKIE && token ? { value: token } : undefined),
    },
  } as never;
}

const HOUR_MS = 60 * 60 * 1000;

function seed({
  role = "admin",
  adminRole = "super_admin",
  unlockedAt,
  suspended = false,
}: {
  role?: string;
  adminRole?: string | null;
  unlockedAt?: string | null;
  suspended?: boolean;
}) {
  fakeDb.reset({
    users: [
      {
        id: "u_1",
        phone: "+2348012345678",
        name: "Ada",
        role,
        admin_role: adminRole,
        suspended,
        suspended_reason: null,
        business_name: null,
        email: null,
        lat: null,
        lng: null,
        phone_verified: true,
        avatar_url: null,
        notifications_enabled: true,
      },
    ],
    sessions: [
      {
        token: "tok_1",
        user_id: "u_1",
        expires_at: new Date(Date.now() + 30 * 24 * HOUR_MS).toISOString(),
        admin_unlocked_at: unlockedAt === undefined ? null : unlockedAt,
      },
    ],
  });
}

async function codeOf(result: unknown): Promise<string | undefined> {
  const body = await (result as Response).json();
  return body.code;
}

beforeEach(() => {
  fakeDb.reset();
});

describe("requireAdmin — the staff sign-in gate", () => {
  it("lets a freshly unlocked admin through and hands back the user", async () => {
    seed({ unlockedAt: new Date().toISOString() });
    const result = await requireAdmin(requestWithSession("tok_1"), "finance");
    expect(result).toHaveProperty("id", "u_1");
    expect(result).toHaveProperty("role", "admin");
  });

  it("refuses an admin who has never signed in on the staff screen", async () => {
    // The exact state every existing session is in the moment migration 020
    // runs. Being an admin with a valid session must not be enough.
    seed({ unlockedAt: null });
    const result = await requireAdmin(requestWithSession("tok_1"), "finance");
    expect((result as Response).status).toBe(403);
    expect(await codeOf(result)).toBe(ADMIN_UNLOCK_REQUIRED);
  });

  it("refuses an admin whose unlock has aged out", async () => {
    seed({ unlockedAt: new Date(Date.now() - 2 * HOUR_MS).toISOString() });
    const result = await requireAdmin(requestWithSession("tok_1"), "finance");
    expect((result as Response).status).toBe(403);
    expect(await codeOf(result)).toBe(ADMIN_UNLOCK_REQUIRED);
  });

  it("refuses a request carrying no session cookie at all", async () => {
    seed({ unlockedAt: new Date().toISOString() });
    const result = await requireAdmin(requestWithSession(null), "finance");
    expect((result as Response).status).toBe(403);
  });

  it("refuses an unknown session token even when a real unlocked session exists", async () => {
    seed({ unlockedAt: new Date().toISOString() });
    const result = await requireAdmin(requestWithSession("tok_forged"), "finance");
    expect((result as Response).status).toBe(403);
  });

  it("does not let an unlock stand in for the admin role", async () => {
    // A stamped unlock on a buyer's session must be worth nothing. This is
    // the escalation the unlock column could plausibly introduce if the role
    // check were ever reordered behind it.
    seed({ role: "buyer", adminRole: null, unlockedAt: new Date().toISOString() });
    const result = await requireAdmin(requestWithSession("tok_1"), "finance");
    expect((result as Response).status).toBe(403);
    expect(await codeOf(result)).toBeUndefined();
  });

  it("keeps scoped roles scoped, and says so rather than asking for a sign-in", async () => {
    // A verification admin reaching a finance route is told their role is
    // wrong, not sent to sign in again — signing in would change nothing.
    seed({ adminRole: "verification_admin", unlockedAt: new Date().toISOString() });
    const result = await requireAdmin(requestWithSession("tok_1"), "finance");
    expect((result as Response).status).toBe(403);
    expect(await codeOf(result)).toBeUndefined();
  });

  it("treats a suspended admin as logged out entirely", async () => {
    seed({ suspended: true, unlockedAt: new Date().toISOString() });
    const result = await requireAdmin(requestWithSession("tok_1"), "finance");
    expect((result as Response).status).toBe(403);
  });
});

describe("requireSuperAdmin — the same gate, one rung higher", () => {
  it("lets an unlocked super admin through", async () => {
    seed({ adminRole: "super_admin", unlockedAt: new Date().toISOString() });
    const result = await requireSuperAdmin(requestWithSession("tok_1"));
    expect(result).toHaveProperty("id", "u_1");
  });

  it("refuses a lesser admin role", async () => {
    seed({ adminRole: "finance_admin", unlockedAt: new Date().toISOString() });
    const result = await requireSuperAdmin(requestWithSession("tok_1"));
    expect((result as Response).status).toBe(403);
    expect(await codeOf(result)).toBeUndefined();
  });

  it("refuses a super admin who hasn't signed in on the staff screen", async () => {
    seed({ adminRole: "super_admin", unlockedAt: null });
    const result = await requireSuperAdmin(requestWithSession("tok_1"));
    expect((result as Response).status).toBe(403);
    expect(await codeOf(result)).toBe(ADMIN_UNLOCK_REQUIRED);
  });
});
