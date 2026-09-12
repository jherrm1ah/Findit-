import { NextRequest, NextResponse } from "next/server";
import { requireAnyAdmin } from "@/lib/adminRoles";
import { hasAdminPermission, AdminPermission } from "@/lib/adminRolesLevels";
import { getAdminAlerts } from "@/lib/alerts";
import { errorResponse } from "@/lib/errors";

// Which permission domain gates each alert — mirrors exactly which tab
// that alert's "count" points back to (see AdminQueue.jsx's TABS gating),
// so a scoped admin never sees an alert count for a tab they can't open.
const ALERT_PERMISSION: Record<string, AdminPermission> = {
  disputes: "moderation",
  payouts: "finance",
  verification: "verification",
  risk: "moderation",
  tickets: "support",
};

export async function GET(req: NextRequest) {
  // requireAnyAdmin rather than a hand-rolled role check: this route serves
  // every admin role and scopes the BODY below, but it must still inherit
  // every guarantee the shared guard carries (staff unlock, suspension).
  const user = await requireAnyAdmin(req);
  if (user instanceof NextResponse) return user;

  try {
    const alerts = await getAdminAlerts();
    const visible = alerts.filter((a) => hasAdminPermission(user.adminRole, ALERT_PERMISSION[a.id]));
    return NextResponse.json({ alerts: visible });
  } catch (err) {
    return errorResponse(err, "Couldn't load admin alerts.");
  }
}
