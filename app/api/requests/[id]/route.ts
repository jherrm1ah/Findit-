import { NextRequest, NextResponse } from "next/server";
import { acceptOffer } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: { acceptOfferId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.acceptOfferId) {
    return NextResponse.json({ error: "acceptOfferId is required" }, { status: 400 });
  }

  const user = getSessionUser(req);
  const result = acceptOffer(params.id, body.acceptOfferId, user?.id ?? null);
  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(result);
}
