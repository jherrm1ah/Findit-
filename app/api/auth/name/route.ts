import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, updateUserName } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Log in first." }, { status: 401 });

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.name) {
    return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  }

  try {
    const updated = await updateUserName(user.id, body.name);
    return NextResponse.json({ user: updated });
  } catch (err) {
    return errorResponse(err, "Couldn't update your name.");
  }
}
