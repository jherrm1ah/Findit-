import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getOrder } from "@/lib/repo";
import { errorResponse } from "@/lib/errors";
import { isNigerianState } from "@/lib/delivery";
import { quoteOrderShipping, pickupLocationsForSeller } from "@/lib/shipping/store";

// The delivery options for the buyer's order to ?state=&area=, and the
// seller's pickup locations. Nothing is priced without a state.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Log in to check out." }, { status: 401 });
  const order = await getOrder(params.id);
  if (!order || order.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const area = (req.nextUrl.searchParams.get("area") ?? "").slice(0, 80);
  try {
    const [quote, pickupLocations] = await Promise.all([
      isNigerianState(state) ? quoteOrderShipping(order, { state, area }) : Promise.resolve(null),
      pickupLocationsForSeller(order.sellerId),
    ]);
    return NextResponse.json({
      quote,
      pickupLocations: pickupLocations.map((l) => ({
        id: l.id, name: l.name, address: l.address, area: l.area, state: l.state, hours: l.pickupHours, instructions: l.pickupInstructions,
      })),
    });
  } catch (err) {
    return errorResponse(err, "Couldn't work out delivery for this order.");
  }
}
