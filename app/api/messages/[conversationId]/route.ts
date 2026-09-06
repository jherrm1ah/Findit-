import { NextRequest, NextResponse } from "next/server";
import { getConversation, listMessages, sendMessage } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rateLimit";

const MAX_MESSAGES = 60;
const WINDOW_MS = 10 * 60 * 1000;

function isParticipant(
  userId: string,
  conversation: { buyerId: string; sellerId: string }
) {
  return userId === conversation.buyerId || userId === conversation.sellerId;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to see this conversation." }, { status: 401 });
  }
  const conversation = await getConversation(params.conversationId);
  if (!conversation || !isParticipant(user.id, conversation)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ messages: await listMessages(params.conversationId, user.id) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to send a message." }, { status: 401 });
  }
  const conversation = await getConversation(params.conversationId);
  if (!conversation || !isParticipant(user.id, conversation)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { allowed, retryAfterSeconds } = checkRateLimit(`msg:${user.id}`, MAX_MESSAGES, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many messages sent recently. Try again in a bit." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  let body: { body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const message = await sendMessage(params.conversationId, user.id, body.body || "");
    return NextResponse.json({ message });
  } catch (err) {
    return errorResponse(err, "Couldn't send that message.");
  }
}
