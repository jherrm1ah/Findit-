import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSellerIdForUser } from "@/lib/repo";
import { updateSellerPayoutAccount, getSellerPayoutAccount } from "@/lib/payments";
import { errorResponse } from "@/lib/errors";

// Real backing for seller payouts — see lib/payments.ts#initiateSellerPayout,
// which can only ever pay a seller who has gone through this. Resolves the
// account name via Paystack before saving, so a payout can never silently
// go to a mistyped account number.
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || user.role !== "seller") {
    return NextResponse.json({ error: "Seller access required." }, { status: 403 });
  }
  const sellerId = await getSellerIdForUser(user.id);
  if (!sellerId) {
    return NextResponse.json({ error: "No store found for this account yet." }, { status: 404 });
  }
  try {
    return NextResponse.json(await getSellerPayoutAccount(sellerId));
  } catch (err) {
    return errorResponse(err, "Couldn't load your payout account.");
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || user.role !== "seller") {
    return NextResponse.json({ error: "Seller access required." }, { status: 403 });
  }
  const sellerId = await getSellerIdForUser(user.id);
  if (!sellerId) {
    return NextResponse.json({ error: "No store found for this account yet." }, { status: 404 });
  }

  let body: { accountNumber?: string; bankCode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.accountNumber || !body.bankCode) {
    return NextResponse.json({ error: "accountNumber and bankCode are required." }, { status: 400 });
  }

  try {
    const result = await updateSellerPayoutAccount(sellerId, {
      accountNumber: body.accountNumber,
      bankCode: body.bankCode,
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, "Couldn't save your payout account.");
  }
}
