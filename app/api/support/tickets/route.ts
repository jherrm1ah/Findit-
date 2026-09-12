import { NextRequest, NextResponse } from "next/server";
import { createTicket, listMyTickets } from "@/lib/support";
import { getSessionUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rateLimit";

const MAX_NEW_TICKETS = 10;
const WINDOW_MS = 60 * 60 * 1000;

// Any signed-in user (buyer or seller) — a real in-app support ticket
// system, replacing the static FAQ + mailto link in HelpSupport.jsx.
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to see your tickets." }, { status: 401 });
  }
  return NextResponse.json({ tickets: await listMyTickets(user.id) });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to open a support ticket." }, { status: 401 });
  }

  const { allowed, retryAfterSeconds } = checkRateLimit(`support-ticket:${user.id}`, MAX_NEW_TICKETS, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many tickets opened recently. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  let body: { subject?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.subject || !body.body) {
    return NextResponse.json({ error: "subject and body are required." }, { status: 400 });
  }

  try {
    const ticket = await createTicket(user.id, body.subject, body.body);
    return NextResponse.json({ ticket });
  } catch (err) {
    return errorResponse(err, "Couldn't open that ticket.");
  }
}
