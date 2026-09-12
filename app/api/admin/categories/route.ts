import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { listAllCategoriesForAdmin, createCategory } from "@/lib/categoryCatalog";
import { logAdminAction } from "@/lib/repo";
import { errorResponse } from "@/lib/errors";

// Admin-only (moderation domain — catalog/content structure, the same
// domain that already governs seller accounts and reported listings).
// Includes inactive categories, for the management screen; the public
// listCategories() at GET /api/categories deliberately excludes those.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req, "moderation");
  if (admin instanceof NextResponse) return admin;
  try {
    return NextResponse.json({ categories: await listAllCategoriesForAdmin() });
  } catch (err) {
    return errorResponse(err, "Couldn't load categories.");
  }
}

// Creates a new category — its id is derived from the label (see
// lib/categoryCatalog.ts#slugify), never admin-typed directly, so it's
// always a clean key ready to be stored on a product's `category` column.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req, "moderation");
  if (admin instanceof NextResponse) return admin;

  let body: { label?: string; iconKey?: string; sortOrder?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.label || !body.label.trim()) {
    return NextResponse.json({ error: "A category name is required." }, { status: 400 });
  }

  try {
    const category = await createCategory({
      label: body.label,
      iconKey: body.iconKey || "Package",
      sortOrder: body.sortOrder,
    });
    await logAdminAction({
      adminId: admin.id,
      action: "category_created",
      targetType: "category",
      targetId: category.id,
      detail: { label: category.label },
    });
    return NextResponse.json({ category });
  } catch (err) {
    return errorResponse(err, "Couldn't create that category.");
  }
}
