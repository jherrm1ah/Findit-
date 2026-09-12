import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isPaystackConfigured, listBanks } from "@/lib/paystack";
import { errorResponse } from "@/lib/errors";

// The bank dropdown for the seller payout-account form — bank_code is a
// Paystack-specific code no seller would type correctly by hand, so this
// proxies Paystack's own bank list (a server-only Paystack call, same as
// every other Paystack request in this app).
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in first." }, { status: 401 });
  }
  if (!isPaystackConfigured()) {
    return NextResponse.json({ configured: false, banks: [] });
  }
  try {
    return NextResponse.json({ configured: true, banks: await listBanks() });
  } catch (err) {
    return errorResponse(err, "Couldn't load the bank list.");
  }
}
