import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, updateNotificationPref } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Log in first." }, { status: 401 });

  let body: { enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const updated = await updateNotificationPref(user.id, body.enabled);
    return NextResponse.json({ user: updated });
  } catch (err) {
    return errorResponse(err, "Couldn't update your notification preference.");
  }
}
