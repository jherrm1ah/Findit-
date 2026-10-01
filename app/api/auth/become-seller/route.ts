import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, becomeSeller } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { errorResponse } from "@/lib/errors";

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 60 * 60 * 1000;

// A logged-in buyer turns their existing account into a seller account,
// instead of needing a second phone number to sign up again.
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to start selling." }, { status: 401 });
  }

  const { allowed, retryAfterSeconds } = await checkRateLimit(`become-seller:${user.id}`, MAX_ATTEMPTS, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  let body: { businessName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.businessName !== "string" || !body.businessName.trim()) {
    return NextResponse.json({ error: "Enter the name your customers will see." }, { status: 400 });
  }

  try {
    return NextResponse.json({ user: await becomeSeller(user.id, body.businessName) });
  } catch (err) {
    return errorResponse(err, "Couldn't switch your account to a seller account.");
  }
}
