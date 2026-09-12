import { NextRequest, NextResponse } from "next/server";
import { getUserByPhone } from "@/lib/auth";
import { requireAdmin } from "@/lib/adminRoles";
import { getSellerIdForUser } from "@/lib/repo";
import { grantStorePlan, grantPlatformSubscription, getPlan, BillingPeriod } from "@/lib/subscriptions";
import { logAdminAction } from "@/lib/repo";
import { errorResponse } from "@/lib/errors";

// Admin-only (finance domain) escape hatch: activates a paid Store OR FindIt
// Pro (platform) plan without going through Paystack at all — for an
// account that paid off-platform (bank transfer) before Paystack keys
// existed here, or for testing either upgrade flow in an environment with
// none configured. Always audit-logged, same as every other high-impact
// admin action (seller approve/reject, promote/demote) in this app.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req, "finance");
  if (admin instanceof NextResponse) return admin;

  let body: { phone?: string; sellerId?: string; userId?: string; planId?: string; billingPeriod?: BillingPeriod };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.planId || (!body.phone && !body.sellerId && !body.userId)) {
    return NextResponse.json({ error: "planId and one of phone, sellerId, or userId are required." }, { status: 400 });
  }

  try {
    const plan = await getPlan(body.planId);
    if (!plan) {
      return NextResponse.json({ error: "That plan isn't available." }, { status: 400 });
    }
    const billingPeriod = body.billingPeriod ?? "monthly";

    if (plan.kind === "platform") {
      let userId = body.userId ?? null;
      if (!userId && body.phone) {
        const user = await getUserByPhone(body.phone);
        if (!user) {
          return NextResponse.json({ error: "No account found for that phone number." }, { status: 404 });
        }
        userId = user.id;
      }
      if (!userId) {
        return NextResponse.json({ error: "Couldn't resolve an account for that request." }, { status: 404 });
      }
      const subscription = await grantPlatformSubscription(userId, plan.id, billingPeriod);
      await logAdminAction({
        adminId: admin.id,
        action: "subscription_granted",
        targetType: "user",
        targetId: userId,
        detail: { planId: plan.id, billingPeriod },
      });
      return NextResponse.json({ subscription });
    }

    let sellerId = body.sellerId ?? null;
    if (!sellerId && body.phone) {
      const user = await getUserByPhone(body.phone);
      if (!user || user.role !== "seller") {
        return NextResponse.json({ error: "No seller account found for that phone number." }, { status: 404 });
      }
      sellerId = await getSellerIdForUser(user.id);
    }
    if (!sellerId) {
      return NextResponse.json({ error: "Couldn't resolve a store for that account." }, { status: 404 });
    }

    const subscription = await grantStorePlan(sellerId, plan.id, billingPeriod);
    await logAdminAction({
      adminId: admin.id,
      action: "subscription_granted",
      targetType: "seller",
      targetId: sellerId,
      detail: { planId: plan.id, billingPeriod },
    });
    return NextResponse.json({ subscription });
  } catch (err) {
    return errorResponse(err, "Couldn't grant that plan.");
  }
}
