import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoles";
import { getTicket, addTicketMessage } from "@/lib/support";
import { errorResponse } from "@/lib/errors";

// Admin-only (support domain) reply — notifies the ticket's owner
// (lib/support.ts#addTicketMessage) the same way any other real
// notification in this app is sent, gated on their own preference.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(req, "support");
  if (admin instanceof NextResponse) return admin;

  const ticket = await getTicket(params.id);
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.body) {
    return NextResponse.json({ error: "body is required." }, { status: 400 });
  }

  try {
    const message = await addTicketMessage(ticket.id, admin.id, true, body.body);
    return NextResponse.json({ message });
  } catch (err) {
    return errorResponse(err, "Couldn't send that reply.");
  }
}
