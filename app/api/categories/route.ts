import { NextResponse } from "next/server";
import { listCategories } from "@/lib/categoryCatalog";
import { errorResponse } from "@/lib/errors";

// Public — the category picker on product listings/requests needs this
// before anyone is logged in, and categories live in the database (not
// hard-coded in the client) so an admin can add/rename/deactivate one
// without a deploy. Forced dynamic for the same reason
// app/api/subscriptions/plans/route.ts is: this handler reads no
// cookies/headers, so Next.js would otherwise statically prerender it at
// BUILD time and serve that one frozen snapshot forever.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ categories: await listCategories() });
  } catch (err) {
    return errorResponse(err, "Couldn't load categories.");
  }
}
