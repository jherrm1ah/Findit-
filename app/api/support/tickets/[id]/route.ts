import { NextRequest, NextResponse } from "next/server";
import { getTicket, listTicketMessages, markReadByUser } from "@/lib/support";
import { getSessionUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";

// Owner-only — opening your own ticket clears your own unread flag (never
// the admin side's; see lib/support.ts#markReadByUser).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to see this ticket." }, { status: 401 });
  }
  const ticket = await getTicket(params.id);
  if (!ticket || ticket.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const messages = await listTicketMessages(ticket.id);
    if (ticket.userHasUnread) await markReadByUser(ticket.id);
    return NextResponse.json({ ticket, messages });
  } catch (err) {
    return errorResponse(err, "Couldn't load that ticket.");
  }
}
