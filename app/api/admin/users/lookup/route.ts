import { NextRequest, NextResponse } from "next/server";
import { getUserByPhone } from "@/lib/auth";
import { requireAdmin } from "@/lib/adminRoles";
import { errorResponse } from "@/lib/errors";

// Used by the "promote to admin" flow, and by support to find an account —
// never returns password data (getUserByPhone -> rowToUser already
// excludes it). Gated to the "users" domain (support_admin/super_admin)
// rather than any admin role: a verification_admin or finance_admin has no
// business enumerating arbitrary accounts by phone number just because
// they're an admin of some kind.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req, "users");
  if (admin instanceof NextResponse) return admin;

  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone || phone.trim().length < 8) {
    return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
  }

  try {
    const user = await getUserByPhone(phone);
    return NextResponse.json({ user });
  } catch (err) {
    return errorResponse(err, "Couldn't look up that account.");
  }
}
