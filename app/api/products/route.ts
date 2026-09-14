import { NextRequest, NextResponse } from "next/server";
import { listProducts, createProduct, getSellerStatusForUser, assertSellerCanTransact, getSellerIdForUser, isValidProductImageUrl, MAX_PRODUCT_IMAGES } from "@/lib/repo";
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

  // An admin's approve/reject/suspend decision must actually control
  // whether a seller can list — see assertSellerCanTransact, the one place
  // this lifecycle is enforced (pending/rejected/suspended all blocked now,
  // not just rejected).
  try {
    assertSellerCanTransact(await getSellerStatusForUser(user.id));
  } catch (err) {
    return errorResponse(err, "Your seller account isn't approved to list products.");
  }

  const { allowed, retryAfterSeconds } = await checkRateLimit(`listing:${user.id}`, MAX_LISTINGS, WINDOW_MS);
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
    images?: string[];
    lat?: number | null;
    lng?: number | null;
    description?: string | null;
    condition?: string;
    qty?: number;
    location?: string | null;
    deliveryOption?: string;
    color?: string | null;
    variation?: string | null;
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
  if (body.condition !== "New" && body.condition !== "Used") {
    return NextResponse.json({ error: "condition must be New or Used" }, { status: 400 });
  }
  if (body.deliveryOption !== "Delivery" && body.deliveryOption !== "Pickup" && body.deliveryOption !== "Both") {
    return NextResponse.json({ error: "deliveryOption must be Delivery, Pickup, or Both" }, { status: 400 });
  }
  if (body.images !== undefined) {
    if (!Array.isArray(body.images) || body.images.some((u) => typeof u !== "string")) {
      return NextResponse.json({ error: "images must be an array of strings" }, { status: 400 });
    }
    if (body.images.length > MAX_PRODUCT_IMAGES) {
      return NextResponse.json({ error: `You can add up to ${MAX_PRODUCT_IMAGES} photos.` }, { status: 400 });
    }
    // Every photo must come from our own upload endpoint, never an
    // arbitrary external URL — otherwise anyone could point a listing at a
    // tracking pixel served to every viewer, or content we don't control.
    if (body.images.some((u) => !isValidProductImageUrl(u, storagePrefix()))) {
      return NextResponse.json(
        { error: "Every photo must be an image uploaded through FindIt." },
        { status: 400 }
      );
    }
  }

  try {
    // Looked up alongside the text business name so the reliable seller_id
    // (migration 009) gets recorded on every new listing — see
    // lib/sellerIdentityMatch.ts for why this can't just be guessed later.
    const sellerId = await getSellerIdForUser(user.id);
    const product = await createProduct({
      category: body.category,
      name: body.name,
      price: body.price,
      seller: user.businessName!,
      sellerId,
      images: body.images ?? [],
      // Sent by the client from the seller's current known location (see
      // components/findit-app/location.js); null if they haven't granted it.
      lat: typeof body.lat === "number" ? body.lat : null,
      lng: typeof body.lng === "number" ? body.lng : null,
      description: body.description ?? null,
      condition: body.condition,
      qty: typeof body.qty === "number" ? body.qty : undefined,
      location: body.location ?? null,
      deliveryOption: body.deliveryOption,
      color: body.color ?? null,
      variation: body.variation ?? null,
    });
    return NextResponse.json({ product });
  } catch (err) {
    return errorResponse(err, "Couldn't create that listing.");
  }
}

function storagePrefix(): string {
  return `${process.env.SUPABASE_URL ?? ""}/storage/v1/object/public/product-images/`;
}
