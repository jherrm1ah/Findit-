import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSellerIdForUser } from "@/lib/repo";
import { errorResponse } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  getSellerVerificationOverview,
  submitVerification,
  SellerType,
  EvidenceKind,
  SubmitVerificationInput,
} from "@/lib/sellerVerification";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// One FormData field per photo evidence kind — lets the client attach
// several photos of the same kind (formData supports repeated keys) while
// keeping the request a single multipart POST alongside the JSON fields.
const PHOTO_FIELDS: Record<string, EvidenceKind> = {
  photo_product_photo: "product_photo",
  photo_shop_photo: "shop_photo",
  photo_business_page: "business_page",
  photo_other: "other",
};

async function requireSellerId(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || user.role !== "seller") {
    return NextResponse.json({ error: "Seller access required." }, { status: 403 });
  }
  const sellerId = await getSellerIdForUser(user.id);
  if (!sellerId) {
    return NextResponse.json({ error: "No store found for this account yet." }, { status: 404 });
  }
  return sellerId;
}

export async function GET(req: NextRequest) {
  const sellerId = await requireSellerId(req);
  if (sellerId instanceof NextResponse) return sellerId;
  try {
    return NextResponse.json(await getSellerVerificationOverview(sellerId));
  } catch (err) {
    return errorResponse(err, "Couldn't load your verification status.");
  }
}

export async function POST(req: NextRequest) {
  const sellerId = await requireSellerId(req);
  if (sellerId instanceof NextResponse) return sellerId;

  const { allowed, retryAfterSeconds } = await checkRateLimit(`seller-verification-submit:${sellerId}`, 10, 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many submissions. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid submission." }, { status: 400 });
  }

  const fieldsRaw = formData.get("fields");
  if (typeof fieldsRaw !== "string") {
    return NextResponse.json({ error: "Missing form data." }, { status: 400 });
  }
  let fields: {
    sellerType?: SellerType;
    category?: string;
    description?: string | null;
    yearsSelling?: string | null;
    socialLinks?: Record<string, string> | null;
    hasPhysicalStore?: boolean;
    publicState?: string | null;
    publicCity?: string | null;
    publicArea?: string | null;
    shopAddress?: string | null;
    lat?: number | null;
    lng?: number | null;
    website?: string | null;
    linkEvidence?: Array<{ kind: EvidenceKind; textValue: string; note: string | null }>;
  };
  try {
    fields = JSON.parse(fieldsRaw);
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  if (!fields.sellerType || !fields.category || fields.hasPhysicalStore === undefined) {
    return NextResponse.json({ error: "sellerType, category, and hasPhysicalStore are required." }, { status: 400 });
  }

  const photoEvidence: SubmitVerificationInput["photoEvidence"] = [];
  for (const [field, kind] of Object.entries(PHOTO_FIELDS)) {
    for (const file of formData.getAll(field)) {
      if (!(file instanceof File)) continue;
      if (!ALLOWED_TYPES.has(file.type)) {
        return NextResponse.json({ error: "Only JPEG, PNG, WEBP, or GIF images are allowed." }, { status: 400 });
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: "Each image must be smaller than 5MB." }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      photoEvidence.push({ kind, buffer, declaredType: file.type, note: null });
    }
  }

  try {
    await submitVerification(sellerId, {
      sellerType: fields.sellerType,
      category: fields.category,
      description: fields.description ?? null,
      yearsSelling: fields.yearsSelling ?? null,
      socialLinks: fields.socialLinks ?? null,
      hasPhysicalStore: fields.hasPhysicalStore,
      publicState: fields.publicState ?? null,
      publicCity: fields.publicCity ?? null,
      publicArea: fields.publicArea ?? null,
      shopAddress: fields.shopAddress ?? null,
      lat: typeof fields.lat === "number" ? fields.lat : null,
      lng: typeof fields.lng === "number" ? fields.lng : null,
      website: fields.website ?? null,
      linkEvidence: fields.linkEvidence ?? [],
      photoEvidence,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Couldn't submit your verification.");
  }
}
