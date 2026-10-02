import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import {
  getAdminReferralOverview,
  listReferralsForAdmin,
  listSuspiciousReferralActivity,
  getActiveQualifyingAction,
  listQualifyingActionHistory,
  setActiveQualifyingAction,
} from "@/lib/referrals";
import { logAdminAction } from "@/lib/repo";
import { errorResponse } from "@/lib/errors";

// Referral admin lives under the existing "users" permission domain rather
// than a new one — see lib/adminRolesLevels.ts. It's about user accounts
// and their relationships to each other, the same ground support_admin
// already covers for everything else user-related, so this doesn't need
// its own admin sub-role.
//
// Every number here comes straight from lib/referrals.ts reading the real
// referrals/referral_rewards tables — nothing on this screen is mocked.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req, "users");
  if (admin instanceof NextResponse) return admin;
  try {
    const [overview, referrals, suspicious, activeQualifyingAction, qualifyingActionHistory] = await Promise.all([
      getAdminReferralOverview(),
      listReferralsForAdmin(),
      listSuspiciousReferralActivity(),
      getActiveQualifyingAction(),
      listQualifyingActionHistory(),
    ]);
    return NextResponse.json({ overview, referrals, suspicious, activeQualifyingAction, qualifyingActionHistory });
  } catch (err) {
    return errorResponse(err, "Couldn't load referral data.");
  }
}

// Changes which real-world action counts as a "successful" referral —
// never a reward amount (that's deliberately still unactivated; see
// migration 035). Append-only, same as the platform fee: the old setting
// stays in qualifyingActionHistory rather than being overwritten.
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req, "users");
  if (admin instanceof NextResponse) return admin;

  let body: { activeQualifyingAction?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.activeQualifyingAction) {
    return NextResponse.json({ error: "activeQualifyingAction is required." }, { status: 400 });
  }

  try {
    await setActiveQualifyingAction(body.activeQualifyingAction, admin.id);
    await logAdminAction({
      adminId: admin.id,
      action: "referral_qualifying_action_changed",
      targetType: "referral_settings",
      targetId: "referrals",
      detail: { activeQualifyingAction: body.activeQualifyingAction },
    });
    return NextResponse.json({ activeQualifyingAction: body.activeQualifyingAction });
  } catch (err) {
    return errorResponse(err, "Couldn't update the referral qualifying action.");
  }
}
