import { NextRequest, NextResponse } from "next/server";
import { listUsersForAdmin, Role } from "@/lib/auth";
import { requireAdmin } from "@/lib/adminRoles";
import { errorResponse } from "@/lib/errors";

const VALID_ROLES: Role[] = ["buyer", "seller", "admin"];

// Admin-only (users domain): every account, searchable/filterable/paginated
// — the real "browse users" screen. See /api/admin/users/lookup for the
// separate exact-phone lookup the promote-to-admin flow uses.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req, "users");
  if (admin instanceof NextResponse) return admin;

  const params = req.nextUrl.searchParams;
  const roleParam = params.get("role");
  const role = roleParam && VALID_ROLES.includes(roleParam as Role) ? (roleParam as Role) : undefined;
  const search = params.get("search") ?? undefined;
  const page = params.get("page") ? Number(params.get("page")) : undefined;

  try {
    const result = await listUsersForAdmin({ role, search, page });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, "Couldn't load users.");
  }
}
