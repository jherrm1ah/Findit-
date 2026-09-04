import { NextRequest, NextResponse } from "next/server";
import { getConversation, listMessages, sendMessage } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";

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
    const message = err instanceof Error ? err.message : "Couldn't send that message.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
