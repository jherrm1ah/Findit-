import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { listAllModerationRulesForAdmin, createModerationRule } from "@/lib/moderationRules";
import { logAdminAction } from "@/lib/repo";
import { errorResponse } from "@/lib/errors";

// Admin-only (moderation domain) — same "admin manages a list of
// configurable rows" shape as app/api/admin/categories/route.ts.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req, "moderation");
  if (admin instanceof NextResponse) return admin;
  try {
    return NextResponse.json({ rules: await listAllModerationRulesForAdmin() });
  } catch (err) {
    return errorResponse(err, "Couldn't load moderation rules.");
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req, "moderation");
  if (admin instanceof NextResponse) return admin;

  let body: { keyword?: string; reason?: string; severity?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.keyword || !body.keyword.trim()) {
    return NextResponse.json({ error: "A keyword is required." }, { status: 400 });
  }
  if (!body.reason || !body.reason.trim()) {
    return NextResponse.json({ error: "A reason is required." }, { status: 400 });
  }
  if (body.severity !== "flag" && body.severity !== "block") {
    return NextResponse.json({ error: "Severity must be flag or block." }, { status: 400 });
  }

  try {
    const rule = await createModerationRule({ keyword: body.keyword, reason: body.reason, severity: body.severity });
    await logAdminAction({
      adminId: admin.id,
      action: "moderation_rule.created",
      targetType: "moderation_rule",
      targetId: rule.id,
      detail: { keyword: rule.keyword, severity: rule.severity },
    });
    return NextResponse.json({ rule });
  } catch (err) {
    return errorResponse(err, "Couldn't create that moderation rule.");
  }
}
