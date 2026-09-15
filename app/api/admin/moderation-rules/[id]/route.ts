import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { updateModerationRule } from "@/lib/moderationRules";
import { logAdminAction } from "@/lib/repo";
import { errorResponse } from "@/lib/errors";

// Admin-only (moderation domain). Edits an existing rule's keyword, reason,
// severity, or active state — never its id.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(req, "moderation");
  if (admin instanceof NextResponse) return admin;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const rule = await updateModerationRule(params.id, body);
    await logAdminAction({
      adminId: admin.id,
      action: "moderation_rule.updated",
      targetType: "moderation_rule",
      targetId: params.id,
      detail: { keyword: rule.keyword, ...body },
    });
    return NextResponse.json({ rule });
  } catch (err) {
    return errorResponse(err, "Couldn't update that moderation rule.");
  }
}
