import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { classifyRequest } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rateLimit";

const MAX_CALLS = 20;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to use AI classification." }, { status: 401 });
  }

  const { allowed, retryAfterSeconds } = checkRateLimit(`ai-classify:${user.id}`, MAX_CALLS, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many AI requests. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  let body: { description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.description || !body.description.trim()) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }

  try {
    const result = await classifyRequest(body.description);
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't classify that request.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
