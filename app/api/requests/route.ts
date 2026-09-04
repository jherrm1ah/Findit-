import { NextRequest, NextResponse } from "next/server";
import { listOpenRequests, createRequest } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (user?.role !== "seller" && user?.role !== "admin") {
    return NextResponse.json(
      { error: "Seller or admin access required." },
      { status: 403 }
    );
  }
  return NextResponse.json({ requests: await listOpenRequests() });
}

export async function POST(req: NextRequest) {
  // Requesting an item needs a real buyer to notify when sellers respond —
  // there's no more instant fake matching, so a request that nobody can
  // ever look back up isn't useful. Real requests require login.
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to submit a request." }, { status: 401 });
  }

  let body: {
    title?: string;
    description?: string;
    category?: string;
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

  const request = await createRequest({
    title: body.title.trim(),
    description: body.description?.trim() || null,
    category: body.category || null,
    budgetMin: toNumberOrNull(body.budgetMin),
    budgetMax: toNumberOrNull(body.budgetMax),
    qty: Number(body.qty) > 0 ? Number(body.qty) : 1,
    location: body.location?.trim() || null,
    condition: body.condition || "New",
    userId: user.id,
  });

  return NextResponse.json({ request });
}
