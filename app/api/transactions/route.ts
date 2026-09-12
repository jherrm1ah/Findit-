import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSellerIdForUser } from "@/lib/repo";
import { listOwnTransactionRecords, getOwnTransactionRecord } from "@/lib/transactionRecord";
import { errorResponse } from "@/lib/errors";

// A person's own verified transaction records — the ones they were a party
// to, as buyer or as seller. Ownership is enforced inside
// lib/transactionRecord.ts rather than here, so this route cannot forget to
// check it and neither can the next one that calls those functions.
//
// With ?code=, returns that single record and its full history. Without,
// returns every record this person is a party to.
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Log in to see your transaction records." }, { status: 401 });
  }

  try {
    const sellerId = user.role === "seller" ? await getSellerIdForUser(user.id) : null;
    const viewer = {
      userId: user.id,
      sellerId,
      sellerName: user.businessName ?? null,
    };

    const code = req.nextUrl.searchParams.get("code");
    if (code) {
      const record = await getOwnTransactionRecord(code, viewer);
      // Identical answer for "no such code" and "not yours", so this cannot
      // be used to discover whether a code exists.
      if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ record });
    }

    return NextResponse.json({ records: await listOwnTransactionRecords(viewer) });
  } catch (err) {
    return errorResponse(err, "Couldn't load your transaction records.");
  }
}
