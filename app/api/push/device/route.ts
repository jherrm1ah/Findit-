import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { appPushConfigured, isValidDeviceToken, saveDeviceToken, removePushSubscription } from "@/lib/outsideAlerts";

// Phone notifications in the FindIt Android app (lib/outsideAlerts.ts, Firebase).
// GET: whether this deployment can send them (FCM_SERVICE_ACCOUNT is set).
export async function GET() {
  return NextResponse.json({ enabled: appPushConfigured() });
}

// POST { token }: this phone's app gets the signed-in user's alerts.
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Log in to turn on alerts." }, { status: 401 });
  let token: unknown;
  try {
    token = (await req.json())?.token;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isValidDeviceToken(token)) return NextResponse.json({ error: "That isn't a valid device." }, { status: 400 });
  try {
    await saveDeviceToken(user.id, token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Couldn't turn on alerts.");
  }
}

// DELETE { token }: stop alerts to this phone (signing out, or turning alerts off).
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ ok: true });
  let token = "";
  try {
    token = String((await req.json())?.token ?? "");
  } catch {
    // nothing to remove
  }
  if (!token) return NextResponse.json({ ok: true });
  try {
    await removePushSubscription(user.id, token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Couldn't turn off alerts.");
  }
}
