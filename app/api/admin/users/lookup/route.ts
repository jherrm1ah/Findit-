import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, getUserByPhone } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";

// Used by the "promote to admin" flow to show which real account a phone
// number belongs to before granting anything — never returns password
// data (getUserByPhone -> rowToUser already excludes it).
export async function GET(req: NextRequest) {
  const admin = await getSessionUser(req);
  if (admin?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone || phone.trim().length < 8) {
    return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
  }

  try {
    const user = await getUserByPhone(phone);
    return NextResponse.json({ user });
  } catch (err) {
    return errorResponse(err, "Couldn't look up that account.");
  }
}
