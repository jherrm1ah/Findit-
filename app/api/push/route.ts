import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { isValidPushSubscription, pushPublicKey, removePushSubscription, savePushSubscription } from "@/lib/outsideAlerts";

// Phone/desktop alerts for this browser (lib/outsideAlerts.ts).
// GET: the public key a browser needs to subscribe (null = alerts aren't set
// up on this deployment, so the app hides the "Turn on alerts" button).
export async function GET() {
  return NextResponse.json({ publicKey: pushPublicKey() });
}

// POST { subscription }: send this signed-in user's alerts to this browser.
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Log in to turn on alerts." }, { status: 401 });
  let body: { subscription?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isValidPushSubscription(body.subscription)) {
    return NextResponse.json({ error: "That isn't a valid alert subscription." }, { status: 400 });
  }
  try {
    await savePushSubscription(user.id, body.subscription);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Couldn't turn on alerts.");
  }
}

// DELETE { endpoint }: stop alerts to this browser (turning them off, or
// signing out).
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ ok: true });
  let endpoint = "";
  try {
    endpoint = String((await req.json())?.endpoint ?? "");
  } catch {
    // nothing to remove
  }
  if (!endpoint) return NextResponse.json({ ok: true });
  try {
    await removePushSubscription(user.id, endpoint);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Couldn't turn off alerts.");
  }
}
