// Pure constants + permission logic for scoped admin roles — deliberately
// free of any server-only import (next/server, lib/auth's session/crypto
// code) so client components (AdminQueue.jsx) can import this file directly
// without bundling server code into browser JS. The request-handling half
// (requireAdmin/requireSuperAdmin) lives in lib/adminRoles.ts, which
// imports these same definitions rather than duplicating them.

export type AdminRole = "super_admin" | "verification_admin" | "support_admin" | "finance_admin" | "moderation_admin";

export const ADMIN_ROLES: { value: AdminRole; label: string; description: string }[] = [
  { value: "super_admin", label: "Super Admin", description: "Full access to everything." },
  { value: "verification_admin", label: "Verification Admin", description: "Seller trust & verification review only." },
  { value: "moderation_admin", label: "Moderation Admin", description: "Seller account status, reports & disputes." },
  { value: "finance_admin", label: "Finance Admin", description: "Subscriptions, plans, and (once built) payments/payouts." },
  { value: "support_admin", label: "Support Admin", description: "User lookup and account help." },
];

export type AdminPermission = "users" | "sellers" | "verification" | "finance" | "moderation" | "support";

const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[] | "*"> = {
  super_admin: "*",
  verification_admin: ["verification"],
  moderation_admin: ["moderation", "sellers"],
  finance_admin: ["finance"],
  support_admin: ["support", "users"],
};

// Pure — the actual access-control decision, unit-testable without a
// database or a request. A null role (shouldn't happen for a real admin
// account, but a defensive default) has no permissions at all rather than
// silently inheriting super_admin's.
export function hasAdminPermission(adminRole: AdminRole | null, permission: AdminPermission): boolean {
  if (!adminRole) return false;
  const perms = ROLE_PERMISSIONS[adminRole];
  return perms === "*" || perms.includes(permission);
}
