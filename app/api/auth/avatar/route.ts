import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, updateUserAvatar } from "@/lib/auth";
import { isValidProductImageUrl } from "@/lib/repo";
import { errorResponse } from "@/lib/errors";

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
