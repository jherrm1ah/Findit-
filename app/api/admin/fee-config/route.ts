import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { getCurrentPlatformFeeBps, setPlatformFeeBps, listFeeHistory } from "@/lib/payments";
import { logAdminAction } from "@/lib/repo";
import { errorResponse } from "@/lib/errors";

// Admin-only (finance domain): the real marketplace commission — never
// hardcoded in application code. Changing it is an INSERT, not an UPDATE
// (see lib/payments.ts#setPlatformFeeBps): the fee an already-paid order
// used is frozen on the order itself and never affected by a later change
// here.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req, "finance");
  if (admin instanceof NextResponse) return admin;
  try {
    const [currentBps, history] = await Promise.all([getCurrentPlatformFeeBps(), listFeeHistory()]);
    return NextResponse.json({ currentBps, history });
  } catch (err) {
    return errorResponse(err, "Couldn't load the fee configuration.");
  }
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req, "finance");
  if (admin instanceof NextResponse) return admin;

  let body: { feeBps?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.feeBps !== "number") {
    return NextResponse.json({ error: "feeBps is required." }, { status: 400 });
  }

  try {
    await setPlatformFeeBps(body.feeBps, admin.id);
    await logAdminAction({
      adminId: admin.id,
      action: "platform_fee_changed",
      targetType: "platform_fee_config",
      targetId: "fee",
      detail: { feeBps: body.feeBps },
    });
    return NextResponse.json({ currentBps: body.feeBps });
  } catch (err) {
    return errorResponse(err, "Couldn't update the platform fee.");
  }
}
