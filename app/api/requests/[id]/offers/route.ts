import { NextRequest, NextResponse } from "next/server";
import { addSellerOfferToRequest } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getSessionUser(req);
  if (user?.role !== "seller") {
    return NextResponse.json({ error: "Seller access required." }, { status: 403 });
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
    const message = err instanceof Error ? err.message : "Couldn't send that offer.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
