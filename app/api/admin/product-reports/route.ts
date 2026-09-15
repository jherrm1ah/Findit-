import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { listOpenProductReportsForAdmin, resolveProductReport, moderateProduct } from "@/lib/productReports";
import { logAdminAction } from "@/lib/repo";
import { errorResponse } from "@/lib/errors";

// Admin-only (moderation domain) — the buyer "report this listing" queue,
// same report/resolve shape as app/api/admin/disputes/route.ts.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req, "moderation");
  if (admin instanceof NextResponse) return admin;
  try {
    return NextResponse.json({ reports: await listOpenProductReportsForAdmin() });
  } catch (err) {
    return errorResponse(err, "Couldn't load product reports.");
  }
}

// Resolves one report, and — when the admin's decision was to act on the
// listing rather than dismiss the report — takes that action on the product
// in the same call, so reviewing a report is a single click either way.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req, "moderation");
  if (admin instanceof NextResponse) return admin;

  let body: { reportId?: string; outcome?: string; note?: string; productId?: string; productName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.reportId) {
    return NextResponse.json({ error: "Missing report." }, { status: 400 });
  }
  if (body.outcome !== "resolved" && body.outcome !== "dismissed") {
    return NextResponse.json({ error: "Choose whether to resolve or dismiss this report." }, { status: 400 });
  }

  try {
    const report = await resolveProductReport(body.reportId, admin.id, body.outcome, body.note ?? null);
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // "resolved" (as opposed to a plain dismissal) means the admin agreed
    // the listing is a problem — remove it. Only when a productId is given
    // (the client always sends it, since the report carries it).
    let removed = false;
    if (body.outcome === "resolved" && body.productId) {
      const product = await moderateProduct(admin.id, body.productId, "removed", body.note || "Removed after a buyer report.");
      removed = Boolean(product);
    }

    await logAdminAction({
      adminId: admin.id,
      action: "product_report.resolved",
      targetType: "product_report",
      targetId: report.id,
      detail: { outcome: body.outcome, productId: body.productId, productName: body.productName, removed },
    });
    return NextResponse.json({ report, removed });
  } catch (err) {
    return errorResponse(err, "Couldn't resolve that report.");
  }
}
