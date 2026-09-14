import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { generateProductDescription } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rateLimit";
import { errorResponse } from "@/lib/errors";

// Same shape as /api/ai/classify-request — seller-only (this drafts a
// PRODUCT listing's description), rate-limited the same way.
const MAX_CALLS = 20;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (user?.role !== "seller") {
    return NextResponse.json({ error: "Seller access required." }, { status: 403 });
  }

  const { allowed, retryAfterSeconds } = await checkRateLimit(`ai-generate-description:${user.id}`, MAX_CALLS, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many AI requests. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  let body: { name?: string; categoryLabel?: string; condition?: string | null; color?: string | null; variation?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.name || !body.categoryLabel) {
    return NextResponse.json({ error: "name and categoryLabel are required" }, { status: 400 });
  }

  try {
    const description = await generateProductDescription({
      name: body.name,
      categoryLabel: body.categoryLabel,
      condition: body.condition ?? null,
      color: body.color ?? null,
      variation: body.variation ?? null,
    });
    return NextResponse.json({ description });
  } catch (err) {
    return errorResponse(err, "Couldn't generate a description.");
  }
}
