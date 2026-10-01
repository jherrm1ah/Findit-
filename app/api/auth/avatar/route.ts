import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, updateUserAvatar } from "@/lib/auth";
import { isValidProductImageUrl } from "@/lib/repo";
import { checkRateLimit } from "@/lib/rateLimit";
import { errorResponse } from "@/lib/errors";

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 60 * 60 * 1000;

// Reuses the same public storage bucket product images use — uploads go
// through POST /api/uploads first (which validates the file itself), and
// this route just needs to confirm the URL it's given actually points
// there before saving it as this user's avatar.
function storagePrefix(): string {
  return `${process.env.SUPABASE_URL ?? ""}/storage/v1/object/public/product-images/`;
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Log in first." }, { status: 401 });

  const { allowed, retryAfterSeconds } = await checkRateLimit(`change-avatar:${user.id}`, MAX_ATTEMPTS, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  let body: { avatarUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.avatarUrl || !isValidProductImageUrl(body.avatarUrl, storagePrefix())) {
    return NextResponse.json({ error: "Invalid image." }, { status: 400 });
  }

  try {
    const updated = await updateUserAvatar(user.id, body.avatarUrl);
    return NextResponse.json({ user: updated });
  } catch (err) {
    return errorResponse(err, "Couldn't update your profile photo.");
  }
}
