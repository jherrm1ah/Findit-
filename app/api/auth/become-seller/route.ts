import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, becomeSeller } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";

// A logged-in buyer turns their existing account into a seller account,
// instead of needing a second phone number to sign up again.
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to start selling." }, { status: 401 });
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
