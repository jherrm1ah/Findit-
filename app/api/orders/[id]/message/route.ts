import { NextRequest, NextResponse } from "next/server";
import { getOrder, getSellerIdForUser, getOrCreateConversation, getPublicUser } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { sellerOwnsItem } from "@/lib/sellerIdentityMatch";

// The seller side of buyer<->seller messaging. Before this, only a buyer
// could start a conversation (from a product page) — a seller had no way to
// reach out, not even about their own order. Deliberately scoped to "an
// order that's really yours" rather than a free-form "message any buyer"
// search, the same way a buyer's own contact path is scoped to a product
// they're looking at — a seller shouldn't be able to message a stranger who
// never ordered from them.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getSessionUser(req);
  if (user?.role !== "seller") {
    return NextResponse.json({ error: "Seller access required." }, { status: 403 });
  }

  const order = await getOrder(params.id);
  if (!order) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const sellerId = await getSellerIdForUser(user.id);
  if (!sellerOwnsItem(user.businessName, sellerId, order.seller, order.sellerId)) {
    return NextResponse.json(
      { error: "You can only message the buyer on your own orders." },
      { status: 403 }
    );
  }

  try {
    const conversationId = await getOrCreateConversation(order.userId, user.id);
    const buyer = await getPublicUser(order.userId);
    return NextResponse.json({ conversationId, buyer });
  } catch (err) {
    return errorResponse(err, "Couldn't start that conversation.");
  }
}
