import { NextRequest, NextResponse } from "next/server";
import { addSellerOfferToRequest, getSellerStatusForUser } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rateLimit";

const MAX_OFFERS = 60;
const WINDOW_MS = 60 * 60 * 1000;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getSessionUser(req);
  if (user?.role !== "seller") {
    return NextResponse.json({ error: "Seller access required." }, { status: 403 });
  }

  const status = await getSellerStatusForUser(user.id);
  if (status === "rejected") {
    return NextResponse.json(
      { error: "Your seller account isn't approved to send offers." },
      { status: 403 }
    );
  }

  const { allowed, retryAfterSeconds } = checkRateLimit(`offer:${user.id}`, MAX_OFFERS, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many offers sent recently. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  let body: { price?: number; delivery?: string; eta?: string; warranty?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body.price !== "number" ||
    !body.delivery?.trim() ||
    !body.eta?.trim() ||
    !body.warranty?.trim()
  ) {
    return NextResponse.json(
      { error: "price, delivery, eta, and warranty are required" },
      { status: 400 }
    );
  }

  try {
    const offer = await addSellerOfferToRequest(params.id, user.businessName!, {
      price: body.price,
      delivery: body.delivery,
      eta: body.eta,
      warranty: body.warranty,
      note: body.note ?? null,
    });
    if (!offer) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ offer });
  } catch (err) {
    return errorResponse(err, "Couldn't send that offer.");
  }
}
