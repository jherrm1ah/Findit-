import { NextRequest, NextResponse } from "next/server";
import { listConversations, findUserByBusinessName, getOrCreateConversation } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rateLimit";

const MAX_NEW_CONVERSATIONS = 30;
const WINDOW_MS = 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to see your messages." }, { status: 401 });
  }
  return NextResponse.json({ conversations: await listConversations(user.id) });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to message a seller." }, { status: 401 });
  }

  let body: { sellerBusinessName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.sellerBusinessName) {
    return NextResponse.json({ error: "sellerBusinessName is required" }, { status: 400 });
  }

  const seller = await findUserByBusinessName(body.sellerBusinessName);
  if (!seller) {
    return NextResponse.json(
      { error: "This seller hasn't joined FindIt directly yet, so there's no one to message." },
      { status: 404 }
    );
  }
  if (seller.id === user.id) {
    return NextResponse.json({ error: "You can't message yourself." }, { status: 400 });
  }

  const { allowed, retryAfterSeconds } = checkRateLimit(
    `newconvo:${user.id}`,
    MAX_NEW_CONVERSATIONS,
    WINDOW_MS
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many new conversations started recently. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  try {
    const conversationId = await getOrCreateConversation(user.id, seller.id);
    return NextResponse.json({ conversationId });
  } catch (err) {
    return errorResponse(err, "Couldn't start that conversation.");
  }
}
