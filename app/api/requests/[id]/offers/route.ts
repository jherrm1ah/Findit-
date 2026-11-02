import { NextRequest, NextResponse } from "next/server";
import { addSellerOfferToRequest, getSellerStatusForUser, assertSellerCanTransact, getSellerIdForUser } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { deliveryTermsText, parseDeliveryFee, type DeliveryOptions } from "@/lib/delivery";

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

  try {
    assertSellerCanTransact(await getSellerStatusForUser(user.id));
  } catch (err) {
    return errorResponse(err, "Your seller account isn't approved to send offers.");
  }

  const { allowed, retryAfterSeconds } = await checkRateLimit(`offer:${user.id}`, MAX_OFFERS, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many offers sent recently. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  let body: {
    price?: number;
    delivery?: string;
    // Structured delivery terms (migration 043): what the buyer can choose at
    // checkout and what delivery adds to the price. The old free-text
    // delivery above is filled in from these when not given.
    deliveryOption?: string;
    deliveryFee?: number | string;
    eta?: string;
    warranty?: string;
    note?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let deliveryOption: DeliveryOptions | null = null;
  let deliveryFee = 0;
  if (body.deliveryOption !== undefined) {
    if (body.deliveryOption !== "Delivery" && body.deliveryOption !== "Pickup" && body.deliveryOption !== "Both") {
      return NextResponse.json({ error: "deliveryOption must be Delivery, Pickup, or Both" }, { status: 400 });
    }
    deliveryOption = body.deliveryOption;
    try {
      deliveryFee = deliveryOption === "Pickup" ? 0 : parseDeliveryFee(body.deliveryFee);
    } catch (err) {
      return errorResponse(err, "Check the delivery fee.");
    }
    if (!body.delivery?.trim()) body.delivery = deliveryTermsText(deliveryOption, deliveryFee);
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
    // See the products route — same seller_id dual-write.
    const sellerId = await getSellerIdForUser(user.id);
    const offer = await addSellerOfferToRequest(params.id, user.businessName!, sellerId, {
      price: body.price,
      delivery: body.delivery,
      eta: body.eta,
      warranty: body.warranty,
      note: body.note ?? null,
      deliveryOption,
      deliveryFee,
    });
    if (!offer) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ offer });
  } catch (err) {
    return errorResponse(err, "Couldn't send that offer.");
  }
}
