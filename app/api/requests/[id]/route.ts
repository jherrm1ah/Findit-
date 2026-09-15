import { NextRequest, NextResponse } from "next/server";
import { acceptOffer, cancelRequest } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to manage this request." }, { status: 401 });
  }

  let body: { acceptOfferId?: string; cancel?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Two actions on the same request, same as orders' PATCH multiplexing a
  // status update and a review submission on one route — a buyer either
  // accepts an offer or closes the request themselves, never both.
  if (body.cancel) {
    try {
      const request = await cancelRequest(params.id, user.id);
      if (!request) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ request });
    } catch (err) {
      return errorResponse(err, "Couldn't cancel that request.");
    }
  }

  if (!body.acceptOfferId) {
    return NextResponse.json({ error: "acceptOfferId is required" }, { status: 400 });
  }

  try {
    const result = await acceptOffer(params.id, body.acceptOfferId, user.id);
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, "Couldn't accept that offer.");
  }
}
