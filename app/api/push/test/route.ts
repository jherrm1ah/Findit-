import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { sendPushToUser } from "@/lib/outsideAlerts";

// "Send a test alert": a push to the signed-in user's own devices, so they
// can see alerts really arrive. A few per hour at most.
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Log in first." }, { status: 401 });
  const { allowed } = await checkRateLimit(`push-test:${user.id}`, 5, 60 * 60 * 1000);
  if (!allowed) return NextResponse.json({ error: "That's enough tests for now. Try again later." }, { status: 429 });
  await sendPushToUser(user.id, { title: "FindIt alerts are on", body: "This is how new orders, messages and offers will reach you.", tag: "test" });
  return NextResponse.json({ ok: true });
}
