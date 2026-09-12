import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { updateCategory } from "@/lib/categoryCatalog";
import { logAdminAction } from "@/lib/repo";
import { errorResponse } from "@/lib/errors";

// Admin-only (moderation domain). Edits an existing category's label, icon,
// sort order, or active state — never its id (see
// lib/categoryCatalog.ts#updateCategory for why: every existing product/
// request row referencing this category stores the id, not the label).
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
    const category = await updateCategory(params.id, body);
    await logAdminAction({
      adminId: admin.id,
      action: "category_updated",
      targetType: "category",
      targetId: params.id,
      detail: body,
    });
    return NextResponse.json({ category });
  } catch (err) {
    return errorResponse(err, "Couldn't update that category.");
  }
}
