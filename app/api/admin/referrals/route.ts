import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import {
  getAdminReferralOverview,
  listReferralsForAdmin,
  listSuspiciousReferralActivity,
  getActiveQualifyingAction,
  listQualifyingActionHistory,
  setActiveQualifyingAction,
  getReferralRewardConfig,
  listReferralRewardConfigHistory,
  setReferralRewardConfig,
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
    const [
      overview,
      referrals,
      suspicious,
      activeQualifyingAction,
      qualifyingActionHistory,
      rewardConfig,
      rewardConfigHistory,
    ] = await Promise.all([
      getAdminReferralOverview(),
      listReferralsForAdmin(),
      listSuspiciousReferralActivity(),
      getActiveQualifyingAction(),
      listQualifyingActionHistory(),
      getReferralRewardConfig(),
      listReferralRewardConfigHistory(),
    ]);
    return NextResponse.json({
      overview,
      referrals,
      suspicious,
      activeQualifyingAction,
      qualifyingActionHistory,
      rewardConfig,
      rewardConfigHistory,
    });
  } catch (err) {
    return errorResponse(err, "Couldn't load referral data.");
  }
}

// Two independent, append-only settings share this one route — which
// real-world action counts as "successful" (never a reward amount itself),
// and the milestone size / credit amount a batch of successful referrals
// earns. A request changes exactly one of the two, chosen by which fields
// it sends; both are append-only, same as the platform fee — the old
// setting stays in its own history rather than being overwritten.
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req, "users");
  if (admin instanceof NextResponse) return admin;

  let body: { activeQualifyingAction?: string; milestoneSize?: number; rewardAmount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (body.activeQualifyingAction) {
      await setActiveQualifyingAction(body.activeQualifyingAction, admin.id);
      await logAdminAction({
        adminId: admin.id,
        action: "referral_qualifying_action_changed",
        targetType: "referral_settings",
        targetId: "referrals",
        detail: { activeQualifyingAction: body.activeQualifyingAction },
      });
      return NextResponse.json({ activeQualifyingAction: body.activeQualifyingAction });
    }

    if (typeof body.milestoneSize === "number" && typeof body.rewardAmount === "number") {
      await setReferralRewardConfig(body.milestoneSize, body.rewardAmount, admin.id);
      await logAdminAction({
        adminId: admin.id,
        action: "referral_reward_config_changed",
        targetType: "referral_reward_config",
        targetId: "referrals",
        detail: { milestoneSize: body.milestoneSize, rewardAmount: body.rewardAmount },
      });
      return NextResponse.json({ milestoneSize: body.milestoneSize, rewardAmount: body.rewardAmount });
    }

    return NextResponse.json(
      { error: "Send either activeQualifyingAction, or both milestoneSize and rewardAmount." },
      { status: 400 }
    );
  } catch (err) {
    return errorResponse(err, "Couldn't update the referral settings.");
  }
}
