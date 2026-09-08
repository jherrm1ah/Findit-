import { NextRequest, NextResponse } from "next/server";
import { reportOrderIssue } from "@/lib/repo";
import { getSessionUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";

// The buyer reports a problem. This holds the payment and puts the order in
// the admin queue rather than completing it.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to report a problem." }, { status: 401 });
  }

  let body: { note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.note !== "string") {
    return NextResponse.json({ error: "Tell us briefly what went wrong." }, { status: 400 });
  }

  try {
    const order = await reportOrderIssue(params.id, user.id, body.note);
    if (!order) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ order });
  } catch (err) {
    return errorResponse(err, "Couldn't report that problem.");
  }
}
