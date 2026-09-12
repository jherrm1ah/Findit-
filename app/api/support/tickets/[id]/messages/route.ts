import { NextRequest, NextResponse } from "next/server";
import { getTicket, addTicketMessage } from "@/lib/support";
import { getSessionUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rateLimit";

const MAX_MESSAGES = 60;
const WINDOW_MS = 10 * 60 * 1000;

// Owner-only reply — the user's half of the thread. A reply on a resolved
// ticket reopens it (see lib/support.ts#addTicketMessage).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to reply." }, { status: 401 });
  }
  const ticket = await getTicket(params.id);
  if (!ticket || ticket.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { allowed, retryAfterSeconds } = await checkRateLimit(`support-message:${user.id}`, MAX_MESSAGES, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many messages sent recently. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

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
    const message = await addTicketMessage(ticket.id, user.id, false, body.body);
    return NextResponse.json({ message });
  } catch (err) {
    return errorResponse(err, "Couldn't send that message.");
  }
}
