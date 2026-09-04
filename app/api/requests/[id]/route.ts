import { NextRequest, NextResponse } from "next/server";
import { acceptOffer } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to accept an offer." }, { status: 401 });
  }

  let body: { acceptOfferId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.acceptOfferId) {
    return NextResponse.json({ error: "acceptOfferId is required" }, { status: 400 });
  }

  const result = await acceptOffer(params.id, body.acceptOfferId, user.id);
  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(result);
}
