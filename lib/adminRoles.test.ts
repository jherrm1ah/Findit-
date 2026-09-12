import { describe, it, expect } from "vitest";
import { hasAdminPermission } from "./adminRoles";

// The real access-control decision behind every admin route's requireAdmin
// call — never rely on the frontend hiding a button for this.
describe("hasAdminPermission", () => {
  it("super_admin can do everything", () => {
    for (const p of ["users", "sellers", "verification", "finance", "moderation", "support"] as const) {
      expect(hasAdminPermission("super_admin", p)).toBe(true);
    }
  });

  it("verification_admin can only touch verification", () => {
    expect(hasAdminPermission("verification_admin", "verification")).toBe(true);
    expect(hasAdminPermission("verification_admin", "finance")).toBe(false);
    expect(hasAdminPermission("verification_admin", "moderation")).toBe(false);
  });

  it("finance_admin can only touch finance", () => {
    expect(hasAdminPermission("finance_admin", "finance")).toBe(true);
    expect(hasAdminPermission("finance_admin", "verification")).toBe(false);
    expect(hasAdminPermission("finance_admin", "sellers")).toBe(false);
  });

  it("moderation_admin covers moderation and basic seller account status", () => {
    expect(hasAdminPermission("moderation_admin", "moderation")).toBe(true);
    expect(hasAdminPermission("moderation_admin", "sellers")).toBe(true);
    expect(hasAdminPermission("moderation_admin", "finance")).toBe(false);
  });

  it("support_admin covers support and user lookup only", () => {
    expect(hasAdminPermission("support_admin", "support")).toBe(true);
    expect(hasAdminPermission("support_admin", "users")).toBe(true);
    expect(hasAdminPermission("support_admin", "verification")).toBe(false);
  });

  it("a null role (shouldn't happen for a real admin, but defensively) has no permissions", () => {
    expect(hasAdminPermission(null, "users")).toBe(false);
    expect(hasAdminPermission(null, "finance")).toBe(false);
  });
});
