import { NextRequest, NextResponse } from "next/server";
import { updateUserLocation } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";

// Called only after the browser's geolocation permission prompt has been
// explicitly granted (see components/findit-app/location.js) — never on a
// timer, never inferred. Syncs the account's last-known location so it
// carries over across devices/sessions once granted once.
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to save your location." }, { status: 401 });
  }

  let body: { lat?: number; lng?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.lat !== "number" || typeof body.lng !== "number") {
    return NextResponse.json({ error: "lat and lng are required numbers." }, { status: 400 });
  }
  if (body.lat < -90 || body.lat > 90 || body.lng < -180 || body.lng > 180) {
    return NextResponse.json({ error: "lat/lng out of range." }, { status: 400 });
  }

  await updateUserLocation(user.id, body.lat, body.lng);
  return NextResponse.json({ ok: true });
}
