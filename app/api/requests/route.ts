import { NextRequest, NextResponse } from "next/server";
import { listOpenRequests, createRequestWithAutoOffers } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (user?.role !== "seller" && user?.role !== "admin") {
    return NextResponse.json(
      { error: "Seller or admin access required." },
      { status: 403 }
    );
  }
  return NextResponse.json({ requests: listOpenRequests() });
}

export async function POST(req: NextRequest) {
  let body: {
    title?: string;
    description?: string;
    budgetMin?: number | string;
    budgetMax?: number | string;
    qty?: number | string;
    location?: string;
    condition?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.title || !body.title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const toNumberOrNull = (v: unknown): number | null => {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const user = getSessionUser(req);
  const { request, offers } = createRequestWithAutoOffers({
    title: body.title.trim(),
    description: body.description?.trim() || null,
    budgetMin: toNumberOrNull(body.budgetMin),
    budgetMax: toNumberOrNull(body.budgetMax),
    qty: Number(body.qty) > 0 ? Number(body.qty) : 1,
    location: body.location?.trim() || "Nigeria",
    condition: body.condition || "New",
    customer: user?.name ?? null,
  });

  return NextResponse.json({ request, offers });
}
