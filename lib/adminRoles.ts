import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, User } from "./auth";
import { hasAdminPermission, AdminPermission } from "./adminRolesLevels";

export { ADMIN_ROLES, hasAdminPermission, type AdminRole, type AdminPermission } from "./adminRolesLevels";

// Shared guard for admin API routes — replaces the repeated
// `if (admin?.role !== "admin")` pattern with one that also checks the
// scoped sub-role. Returns the authenticated admin User on success, or a
// ready-to-return 403 NextResponse otherwise.
export async function requireAdmin(req: NextRequest, permission: AdminPermission): Promise<User | NextResponse> {
  const user = await getSessionUser(req);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  if (!hasAdminPermission(user.adminRole, permission)) {
    return NextResponse.json(
      { error: `Your admin role (${user.adminRole ?? "none"}) doesn't include ${permission} access.` },
      { status: 403 }
    );
  }
  return user;
}

// The two admin-creation actions are checked directly against super_admin
// rather than through hasAdminPermission — granting/revoking admin access
// itself is categorically more sensitive than any single permission
// domain: a lesser admin role must never be able to create a more powerful
// one, so this isn't just another AdminPermission value.
export async function requireSuperAdmin(req: NextRequest): Promise<User | NextResponse> {
  const user = await getSessionUser(req);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  if (user.adminRole !== "super_admin") {
    return NextResponse.json({ error: "Only a Super Admin can do that." }, { status: 403 });
  }
  return user;
}
