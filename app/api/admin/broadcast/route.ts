import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/adminRoles";
import { sendBroadcast, BroadcastAudience } from "@/lib/broadcast";
import { logAdminAction } from "@/lib/repo";
import { checkRateLimit } from "@/lib/rateLimit";
import { errorResponse } from "@/lib/errors";

const VALID_AUDIENCES: BroadcastAudience[] = ["all", "buyers", "sellers"];
// A platform-wide announcement to every user is categorically more
// sensitive than a single admin action — checked against super_admin
// directly, same as promoting/demoting another admin, not any single
// AdminPermission domain.
const MAX_BROADCASTS_PER_DAY = 5;
const WINDOW_MS = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const admin = await requireSuperAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const rate = checkRateLimit(`broadcast:${admin.id}`, MAX_BROADCASTS_PER_DAY, WINDOW_MS);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Too many announcements sent today — try again in ${Math.ceil(rate.retryAfterSeconds / 3600)}h.` },
      { status: 429 }
    );
  }

  let body: { title?: string; body?: string; audience?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.title || !body.body) {
    return NextResponse.json({ error: "title and body are required." }, { status: 400 });
  }
  if (!body.audience || !VALID_AUDIENCES.includes(body.audience as BroadcastAudience)) {
    return NextResponse.json({ error: "audience must be one of: all, buyers, sellers." }, { status: 400 });
  }

  try {
    const result = await sendBroadcast(body.title, body.body, body.audience as BroadcastAudience);
    await logAdminAction({
      adminId: admin.id,
      action: "broadcast_sent",
      targetType: "broadcast",
      targetId: result.audience,
      detail: { title: body.title, recipientCount: result.recipientCount },
    });
    return NextResponse.json({ result });
  } catch (err) {
    return errorResponse(err, "Couldn't send that announcement.");
  }
}
