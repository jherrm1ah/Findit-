import { NextRequest, NextResponse } from "next/server";
import { confirmDelivery } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";

// The buyer confirms their order arrived. Deliberately buyer-only: this is
// what releases the money, so the seller must not be able to reach it.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to confirm this order." }, { status: 401 });
  }

  try {
    const order = await confirmDelivery(params.id, user.id);
    if (!order) {
      // Also covers an order belonging to someone else — same response
      // either way, so this can't be used to probe other people's orders.
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ order });
  } catch (err) {
    return errorResponse(err, "Couldn't confirm that order.");
  }
}
