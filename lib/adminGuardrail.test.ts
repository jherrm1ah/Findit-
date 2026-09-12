import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

// Companion to selectStarGuardrail.test.ts, for authorization instead of
// column exposure.
//
// Every admin route must gate through one of the shared guards in
// lib/adminRoles.ts. Three of them used to hand-roll the check instead —
// `getSessionUser(req)` followed by `user.role !== "admin"` — which reads as
// equivalent and is not: it silently opts that route out of every guarantee
// the shared guard grows later. That is exactly what happened when the staff
// sign-in unlock (migration 020) was added to requireAdmin: the admin
// Overview, Alerts and OTP-stats routes kept answering a session that had
// never signed in on the staff screen, exposing user counts, seller counts,
// revenue and MRR.
//
// A hand-rolled check is not a smaller version of the guard. It is a route
// that stops receiving security fixes. This test fails the moment a new one
// appears.
const ADMIN_API_DIR = join(__dirname, "..", "app", "api", "admin");
const REPO_ROOT = join(__dirname, "..");

const SHARED_GUARDS = /\b(requireAdmin|requireSuperAdmin|requireAnyAdmin)\s*\(/;
const HAND_ROLLED_SESSION = /\bgetSessionUser\s*\(/;

// The one legitimate exception: staff sign-in itself cannot require the
// unlock it exists to grant, and must read the current session directly to
// decide whether it is issuing a session or upgrading one.
const ALLOWED_DIRECT_SESSION = new Set(["app/api/admin/session/route.ts"]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

function relative(file: string): string {
  return file.slice(REPO_ROOT.length + 1);
}

const adminRoutes = walk(ADMIN_API_DIR).filter((f) => f.endsWith("route.ts"));

describe("admin route authorization guardrail", () => {
  it("finds admin routes to check at all", () => {
    // Guards the guard: a broken path would make every assertion below pass
    // vacuously, which is the worst possible outcome for a security test.
    expect(adminRoutes.length).toBeGreaterThan(20);
  });

  it("every admin route gates through a shared guard", () => {
    const offenders = adminRoutes
      .filter((file) => !ALLOWED_DIRECT_SESSION.has(relative(file)))
      .filter((file) => !SHARED_GUARDS.test(readFileSync(file, "utf8")))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  it("no admin route reads the session directly instead of using a guard", () => {
    const offenders = adminRoutes
      .filter((file) => !ALLOWED_DIRECT_SESSION.has(relative(file)))
      .filter((file) => HAND_ROLLED_SESSION.test(readFileSync(file, "utf8")))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  it("staff sign-in is the only route allowed to bypass the guard, and still exists", () => {
    // If this route is ever renamed or deleted, the exception above must be
    // revisited rather than left pointing at nothing.
    const present = adminRoutes.map(relative);
    for (const allowed of ALLOWED_DIRECT_SESSION) {
      expect(present).toContain(allowed);
    }
  });
});
