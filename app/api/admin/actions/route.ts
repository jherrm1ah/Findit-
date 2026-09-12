import { NextRequest, NextResponse } from "next/server";
import { listAdminActions } from "@/lib/repo";
import { requireSuperAdmin } from "@/lib/adminRoles";

// The platform-wide audit trail — every admin action across every domain
// (fee changes, promote/demote, seller suspensions with their reasons,
// refunds, ...), not scoped to any one AdminPermission. A support_admin
// or verification_admin was previously able to read this in full via a
// bare role === "admin" check, seeing far outside their own granted
// domains — the same cross-domain visibility this codebase otherwise
// restricts to super_admin (see "Team & admin access" /
// "Seller identity migration" in the Admin tools tab).
export async function GET(req: NextRequest) {
  const admin = await requireSuperAdmin(req);
  if (admin instanceof NextResponse) return admin;
  return NextResponse.json({ actions: await listAdminActions() });
}
