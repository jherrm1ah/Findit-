import { NextRequest, NextResponse } from "next/server";
import { listOpenRequests, createRequest } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rateLimit";

const MAX_REQUESTS = 10;
const WINDOW_MS = 60 * 60 * 1000;

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

  const { allowed, retryAfterSeconds } = checkRateLimit(`request:${user.id}`, MAX_REQUESTS, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests submitted recently. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  let body: {
    title?: string;
    description?: string;
    category?: string;
    budgetMin?: number | string;
    budgetMax?: number | string;
    qty?: number | string;
    location?: string;
    lat?: number | null;
    lng?: number | null;
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

  try {
    const request = await createRequest({
      title: body.title.trim(),
      description: body.description?.trim() || null,
      category: body.category || null,
      budgetMin: toNumberOrNull(body.budgetMin),
      budgetMax: toNumberOrNull(body.budgetMax),
      qty: Number(body.qty) > 0 ? Number(body.qty) : 1,
      location: body.location?.trim() || null,
      // From the buyer's current known location (see
      // components/findit-app/location.js); null if not granted.
      lat: typeof body.lat === "number" ? body.lat : null,
      lng: typeof body.lng === "number" ? body.lng : null,
      condition: body.condition || "New",
      userId: user.id,
    });
    return NextResponse.json({ request });
  } catch (err) {
    return errorResponse(err, "Couldn't submit that request.");
  }
}
