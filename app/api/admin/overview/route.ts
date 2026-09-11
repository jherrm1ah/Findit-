import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, getUserCounts } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/adminRolesLevels";
import { getSellerStatusCounts, countDisputedOrders } from "@/lib/repo";
import { getVerificationQueueCounts } from "@/lib/sellerVerification";
import { getSubscriptionOverviewCounts } from "@/lib/subscriptions";
import { errorResponse } from "@/lib/errors";

// Real, permission-scoped stats for the admin Overview tab — every number
// here is a live count against the actual tables, not a placeholder. Each
// section is only computed (and only returned) when the requesting admin's
// role actually grants that permission domain, so a scoped admin never sees
// data outside what they're allowed to act on.
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const can = (permission: Parameters<typeof hasAdminPermission>[1]) => hasAdminPermission(user.adminRole, permission);

  try {
    const overview: Record<string, unknown> = {};

    if (can("users") || can("support")) {
      overview.users = await getUserCounts();
    }
    if (can("sellers") || can("moderation")) {
      overview.sellers = await getSellerStatusCounts();
    }
    if (can("verification")) {
      overview.verification = await getVerificationQueueCounts();
    }
    if (can("moderation")) {
      overview.moderation = { openDisputes: await countDisputedOrders() };
    }
    if (can("finance")) {
      overview.finance = await getSubscriptionOverviewCounts();
    }

    return NextResponse.json({ overview });
  } catch (err) {
    return errorResponse(err, "Couldn't load the admin overview.");
  }
}
