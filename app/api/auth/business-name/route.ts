import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, updateSellerBusinessName } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Log in first." }, { status: 401 });
  if (user.role !== "seller") {
    return NextResponse.json({ error: "Only seller accounts have a business name." }, { status: 403 });
  }

  let body: { businessName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.businessName) {
    return NextResponse.json({ error: "Enter a business name." }, { status: 400 });
  }

  try {
    const updated = await updateSellerBusinessName(user.id, body.businessName);
    return NextResponse.json({ user: updated });
  } catch (err) {
    return errorResponse(err, "Couldn't update your business name.");
  }
}
