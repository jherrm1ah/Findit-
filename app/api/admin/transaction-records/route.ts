import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { getTransactionRecordForAdmin, addAdminCorrection } from "@/lib/transactionRecord";
import { logAdminAction } from "@/lib/repo";
import { errorResponse } from "@/lib/errors";

// Admin investigation of a verified transaction. Finance domain, matching the
// existing transactions ledger route.
//
// Read-only by design. There is no endpoint here that rewrites a record's
// snapshot columns, because the value of a verification record is that it
// says what was true at completion and keeps saying it. The one thing an
// admin may do is POST a correction, which APPENDS an explaining event and
// leaves the history intact.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req, "finance");
  if (admin instanceof NextResponse) return admin;

  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Pass a transaction code to look up." }, { status: 400 });
  }

  try {
    const record = await getTransactionRecordForAdmin(code);
    if (!record) return NextResponse.json({ error: "No transaction record with that code." }, { status: 404 });
    return NextResponse.json({ record });
  } catch (err) {
    return errorResponse(err, "Couldn't load that transaction record.");
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req, "finance");
  if (admin instanceof NextResponse) return admin;

  let body: { code?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const reason = body.reason?.trim();
  if (!body.code || !reason || reason.length < 5) {
    return NextResponse.json(
      { error: "A correction needs the transaction code and a reason of at least 5 characters." },
      { status: 400 }
    );
  }

  try {
    const ok = await addAdminCorrection(body.code, admin.id, reason);
    if (!ok) return NextResponse.json({ error: "No transaction record with that code." }, { status: 404 });

    // Written to the platform audit log as well as the record's own history,
    // so a correction shows up wherever an investigator looks.
    await logAdminAction({
      adminId: admin.id,
      action: "transaction_record.corrected",
      targetType: "transaction_record",
      targetId: body.code,
      detail: { reason },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Couldn't record that correction.");
  }
}
