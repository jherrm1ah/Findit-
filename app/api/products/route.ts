import { NextRequest, NextResponse } from "next/server";
import { listProducts, createProduct, getSellerStatusForUser, isValidProductImageUrl } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rateLimit";

const MAX_LISTINGS = 30;
const WINDOW_MS = 60 * 60 * 1000;

export async function GET() {
  return NextResponse.json({ products: await listProducts() });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (user?.role !== "seller") {
    return NextResponse.json({ error: "Seller access required." }, { status: 403 });
  }

  // An admin's "reject" action must actually stop a seller from listing —
  // otherwise it's cosmetic. (Pending/approved sellers can already list;
  // only rejected sellers are blocked.)
  const status = await getSellerStatusForUser(user.id);
  if (status === "rejected") {
    return NextResponse.json(
      { error: "Your seller account isn't approved to list products." },
      { status: 403 }
    );
  }

  const { allowed, retryAfterSeconds } = checkRateLimit(`listing:${user.id}`, MAX_LISTINGS, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many listings created recently. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  let body: {
    category?: string;
    name?: string;
    price?: number;
    imageUrl?: string | null;
    lat?: number | null;
    lng?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.category || !body.name || typeof body.price !== "number") {
    return NextResponse.json(
      { error: "category, name, and price are required" },
      { status: 400 }
    );
  }
  if (body.imageUrl !== undefined && body.imageUrl !== null && typeof body.imageUrl !== "string") {
    return NextResponse.json({ error: "imageUrl must be a string or null" }, { status: 400 });
  }
  // A listing's image must come from our own upload endpoint, never an
  // arbitrary external URL — otherwise anyone could point a listing at a
  // tracking pixel served to every viewer, or content we don't control.
  if (body.imageUrl && !isValidProductImageUrl(body.imageUrl, storagePrefix())) {
    return NextResponse.json(
      { error: "imageUrl must be an image uploaded through FindIt." },
      { status: 400 }
    );
  }

  try {
    const product = await createProduct({
      category: body.category,
      name: body.name,
      price: body.price,
      seller: user.businessName!,
      imageUrl: body.imageUrl ?? null,
      // Sent by the client from the seller's current known location (see
      // components/findit-app/location.js); null if they haven't granted it.
      lat: typeof body.lat === "number" ? body.lat : null,
      lng: typeof body.lng === "number" ? body.lng : null,
    });
    return NextResponse.json({ product });
  } catch (err) {
    return errorResponse(err, "Couldn't create that listing.");
  }
}

function storagePrefix(): string {
  return `${process.env.SUPABASE_URL ?? ""}/storage/v1/object/public/product-images/`;
}
