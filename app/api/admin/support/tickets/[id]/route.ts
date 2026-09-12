import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { getTicket, listTicketMessages, markReadByAdmin, resolveTicket } from "@/lib/support";
import { logAdminAction } from "@/lib/repo";
import { errorResponse } from "@/lib/errors";

// Admin-only (support domain). Opening a ticket clears the admin-side
// unread flag (never the user's own — see lib/support.ts#markReadByAdmin).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(req, "support");
  if (admin instanceof NextResponse) return admin;
  const ticket = await getTicket(params.id);
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const messages = await listTicketMessages(ticket.id);
    if (ticket.adminHasUnread) await markReadByAdmin(ticket.id);
    return NextResponse.json({ ticket, messages });
  } catch (err) {
    return errorResponse(err, "Couldn't load that ticket.");
  }
}

// The only edit an admin makes directly on the ticket itself — marking it
// resolved. Replying is a separate POST to ./messages.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(req, "support");
  if (admin instanceof NextResponse) return admin;

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.status !== "resolved") {
    return NextResponse.json({ error: "The only supported status here is 'resolved'." }, { status: 400 });
  }

  try {
    const ticket = await resolveTicket(params.id);
    await logAdminAction({
      adminId: admin.id,
      action: "support_ticket_resolved",
      targetType: "support_ticket",
      targetId: params.id,
    });
    return NextResponse.json({ ticket });
  } catch (err) {
    return errorResponse(err, "Couldn't resolve that ticket.");
  }
}
