import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { classifyProductPhoto } from "@/lib/ai";
import { matchesDeclaredImageType } from "@/lib/storage";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { errorResponse } from "@/lib/errors";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_CALLS = 15;
const WINDOW_MS = 60 * 60 * 1000;

// Guest-accessible on purpose — Browse is guest-accessible (see MainApp's
// guest browsing support), and the camera button is just another way to
// fill in the same search box, not a gated action. Rate-limited by account
// when logged in, by IP otherwise — the same fallback send-otp/signup use,
// for the same reason: IP is the only thing to bound a guest's call volume
// by, and every call here is a real, billed Gemini request.
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  const rateKey = user ? `ai-visual-search:${user.id}` : `ai-visual-search:${getClientIp(req)}`;
  const { allowed, retryAfterSeconds } = await checkRateLimit(rateKey, MAX_CALLS, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many visual searches. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid submission." }, { status: 400 });
  }

  const file = formData.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A photo is required." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG, WEBP, or GIF images are allowed." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Photo must be smaller than 5MB." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Real file-signature check, not just the declared Content-Type — same
  // reasoning and helper as every other image upload route (lib/storage.ts).
  if (!matchesDeclaredImageType(buffer, file.type)) {
    return NextResponse.json({ error: "That file doesn't look like a valid image." }, { status: 400 });
  }

  try {
    const result = await classifyProductPhoto(buffer, file.type);
    return NextResponse.json({ result });
  } catch (err) {
    return errorResponse(err, "Couldn't search with that photo.");
  }
}
