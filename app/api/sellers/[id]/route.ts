import { NextRequest, NextResponse } from "next/server";
import { setSellerStatus, logAdminAction, listPublicProductsForSeller } from "@/lib/repo";
import { getPublicSellerProfile } from "@/lib/sellerPublicProfile";
import { requireAdmin } from "@/lib/adminRoles";
import { errorResponse } from "@/lib/errors";

// PUBLIC. A seller's storefront is meant to be readable by anyone — a logged
// out visitor, a buyer, another seller — which is why there is no session
// check here. What keeps that safe is not authentication but the shape of
// what comes back: lib/sellerPublicProfile.ts names the columns it reads and
// builds an explicit object, so a private column added to the sellers table
// later (a bank account, an admin's rejection note) cannot leak through this
// route by default.
//
// Until now no GET existed at all. The seller profile screen was assembled
// entirely on the client by filtering the already-loaded products array on
// the seller's business NAME, which meant a seller with no active listings
// had no profile, and two sellers sharing a name shared one.
//
// `id` accepts a seller id or a business name. The id is the correct key;
// the name path serves listings created before migration 009's backfill, and
// answers 409 rather than guessing when a name maps to two accounts.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const result = await getPublicSellerProfile(params.id, (seller) =>
      listPublicProductsForSeller(seller)
    );

    if (result.status === "ambiguous") {
      return NextResponse.json(
        {
          error:
            "More than one seller account uses this business name, so this link can't identify which store to open.",
          code: "ambiguous_seller_name",
        },
        { status: 409 }
      );
    }
    if (result.status === "not_found") {
      // Deliberately identical for "no such seller" and "seller is suspended
      // or rejected" — a buyer has no business learning that a specific
      // account was removed.
      return NextResponse.json({ error: "Seller not found." }, { status: 404 });
    }

    return NextResponse.json({ seller: result.profile });
  } catch (err) {
    return errorResponse(err, "Couldn't load that seller.");
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireAdmin(req, "moderation");
  if (user instanceof NextResponse) return user;

  let body: { status?: string; reason?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.status !== "approved" && body.status !== "rejected" && body.status !== "suspended") {
    return NextResponse.json(
      { error: "status must be 'approved', 'rejected', or 'suspended'" },
      { status: 400 }
    );
  }

  try {
    const seller = await setSellerStatus(params.id, body.status, body.reason ?? null);
    if (!seller) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Best-effort audit trail — who approved/rejected/suspended which
    // seller, and why. Never blocks the action itself if logging fails.
    await logAdminAction({
      adminId: user.id,
      action: `seller.${body.status}`,
      targetType: "seller",
      targetId: params.id,
      detail: { sellerName: seller.name, reason: body.reason ?? null },
    });
    return NextResponse.json({ seller });
  } catch (err) {
    return errorResponse(err, "Couldn't update that seller.");
  }
}
