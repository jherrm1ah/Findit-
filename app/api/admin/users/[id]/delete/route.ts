import { NextRequest, NextResponse } from "next/server";
import { adminDeleteAccount } from "@/lib/auth";
import { getDb, assertNoError } from "@/lib/db";
import { logAdminAction } from "@/lib/repo";
import { requireAdmin } from "@/lib/adminRoles";
import { errorResponse } from "@/lib/errors";
import { getClientIp } from "@/lib/rateLimit";
import { isSmsConfigured, sendSms } from "@/lib/sms";
import { createOtp, verifyOtp, clearOtp, OtpResendCooldownError } from "@/lib/otp";

// Admin-only (users domain): delete an account someone asked to delete by email.
//   { action: "send_code" }        texts a code to the account's own phone
//   { action: "confirm", code }    deletes it once the owner has read that code back
// The code proves the request comes from whoever holds the account's phone, not just from an
// email address. Deletion itself is public.delete_account (migration 048).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(req, "users");
  if (admin instanceof NextResponse) return admin;
  if (params.id === admin.id) {
    return NextResponse.json({ error: "You can't delete your own account here." }, { status: 400 });
  }

  let body: { action?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const row = assertNoError(
      await getDb().from("users").select("id, phone, name, role, deleted_at").eq("id", params.id).maybeSingle(),
      "loading account"
    ) as { id: string; phone: string; name: string; role: string; deleted_at: string | null } | null;
    if (!row) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    if (row.deleted_at) return NextResponse.json({ error: "This account is already deleted." }, { status: 400 });
    if (row.role === "admin") return NextResponse.json({ error: "Staff accounts can't be deleted here." }, { status: 400 });

    if (body.action === "send_code") {
      if (!isSmsConfigured()) {
        return NextResponse.json({ error: "Text messages aren't set up, so a code can't be sent." }, { status: 503 });
      }
      const { code, expiresInSeconds } = await createOtp({ phone: row.phone, purpose: "delete_account", requestIp: getClientIp(req) });
      await sendSms(
        row.phone,
        `FindIt: someone asked to DELETE your FindIt account. If that was you, give this code to FindIt support: ${code} (expires in ${Math.round(expiresInSeconds / 60)} min). If not, ignore this message and your account stays.`
      );
      await logAdminAction({ adminId: admin.id, action: "user.delete_code_sent", targetType: "user", targetId: row.id, detail: { name: row.name } });
      const last4 = row.phone.slice(-4);
      return NextResponse.json({ sent: true, to: `…${last4}` });
    }

    if (body.action === "confirm") {
      const code = String(body.code ?? "").replace(/\D/g, "");
      if (!code) return NextResponse.json({ error: "Enter the code the account owner received." }, { status: 400 });
      const check = await verifyOtp({ phone: row.phone, purpose: "delete_account", code });
      if (!check.ok) {
        const msg = {
          not_found: "No code was sent for this account. Send one first.",
          expired: "That code has expired. Send a new one.",
          too_many_attempts: "Too many wrong codes. Send a new one.",
          incorrect: "That code isn't right.",
        }[check.reason];
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      const result = await adminDeleteAccount(row.id);
      if (!result.ok) return NextResponse.json({ error: "This account can't be deleted yet.", blocked: result.blocked }, { status: 409 });
      await clearOtp(row.phone, "delete_account").catch(() => {});
      await logAdminAction({ adminId: admin.id, action: "user.deleted_on_request", targetType: "user", targetId: row.id, detail: { name: row.name } });
      return NextResponse.json({ deleted: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    if (err instanceof OtpResendCooldownError) {
      return NextResponse.json({ error: "Wait a moment before sending another code.", retryAfter: err.retryAfterSeconds }, { status: 429 });
    }
    return errorResponse(err, "Couldn't complete that.");
  }
}
