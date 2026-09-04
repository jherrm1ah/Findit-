import { NextRequest, NextResponse } from "next/server";
import { submitOrderReview } from "@/lib/repo";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: { rating?: number; comment?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.rating !== "number" || body.rating < 1 || body.rating > 5) {
    return NextResponse.json(
      { error: "rating must be a number between 1 and 5" },
      { status: 400 }
    );
  }

  const order = submitOrderReview(params.id, {
    rating: body.rating,
    comment: body.comment ?? null,
  });
  if (!order) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ order });
}
