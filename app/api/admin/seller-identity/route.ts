import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import {
  planSellerIdBackfill,
  verifySellerIdIntegrity,
  type VerificationReport,
} from "@/lib/sellerIdentityMatch";

// Steps B (backfill) and D (verification) of the seller_id migration — see
// migration 009 and lib/sellerIdentityMatch.ts for the full story. Both
// halves are admin-only, both are read-first: GET only ever reads, and POST
// defaults to a dry run that computes but never writes.

type Row = { id: string; seller: string; seller_id: string | null };

async function loadSellerNames(): Promise<{ id: string; name: string }[]> {
  const db = getDb();
  const result = await db.from("sellers").select("id, name");
  if (result.error) throw new Error(`loading sellers: ${result.error.message}`);
  return (result.data ?? []) as { id: string; name: string }[];
}

async function loadRows(table: "products" | "orders" | "offers"): Promise<Row[]> {
  const db = getDb();
  const result = await db.from(table).select("id, seller, seller_id");
  if (result.error) throw new Error(`loading ${table}: ${result.error.message}`);
  return (result.data ?? []) as Row[];
}

// GET — Step D: is seller_id trustworthy yet? Never writes anything.
export async function GET(req: NextRequest) {
  const admin = await getSessionUser(req);
  if (admin?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  try {
    const sellers = await loadSellerNames();
    const sellerNamesById = new Map(sellers.map((s) => [s.id, s.name]));

    const report: Record<string, VerificationReport> = {};
    for (const table of ["products", "orders", "offers"] as const) {
      const rows = await loadRows(table);
      report[table] = verifySellerIdIntegrity(
        rows.map((r) => ({ id: r.id, sellerName: r.seller, sellerId: r.seller_id })),
        sellerNamesById
      );
    }

    return NextResponse.json({
      ...report,
      // seller_id is a real foreign key to sellers(id), and no code path in
      // this app ever deletes a sellers row — so an orphaned seller_id
      // (pointing at a seller that no longer exists) is enforced as
      // impossible by Postgres itself, not just unlikely. Nothing to scan for.
      orphanedRelationships: "not possible — seller_id is a real foreign key, and sellers are never deleted",
    });
  } catch (err) {
    return errorResponse(err, "Couldn't load the seller_id verification report.");
  }
}

// POST — Step B: fill in seller_id, but only where the match is unambiguous.
// Body: { apply?: boolean }. Default (or apply: false) computes and returns
// the plan without writing anything — a preview, safe to call freely.
export async function POST(req: NextRequest) {
  const admin = await getSessionUser(req);
  if (admin?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  let body: { apply?: boolean };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const apply = body.apply === true;

  try {
    const sellers = await loadSellerNames();
    const db = getDb();

    const result: Record<string, unknown> = {};
    for (const table of ["products", "orders", "offers"] as const) {
      const allRows = await loadRows(table);
      const unresolved = allRows.filter((r) => !r.seller_id);
      const plan = planSellerIdBackfill(
        unresolved.map((r) => ({ id: r.id, sellerName: r.seller })),
        sellers
      );

      let appliedCount = 0;
      if (apply && plan.matched.length > 0) {
        // Grouped by sellerId so this is at most one update per distinct
        // seller, not one per row — the plan is never applied to anything
        // ambiguous or unmatched, only rows with exactly one possible seller.
        const idsBySellerId = new Map<string, string[]>();
        for (const m of plan.matched) {
          const list = idsBySellerId.get(m.sellerId) ?? [];
          list.push(m.id);
          idsBySellerId.set(m.sellerId, list);
        }
        for (const [sellerId, ids] of idsBySellerId) {
          const updateResult = await db.from(table).update({ seller_id: sellerId }).in("id", ids);
          if (updateResult.error) {
            throw new Error(`applying backfill to ${table}: ${updateResult.error.message}`);
          }
          appliedCount += ids.length;
        }
      }

      // Grouped by name rather than listed per-row: an admin needs to know
      // "3 products say 'Chidi Electronics', which matches 2 accounts" —
      // not the same fact repeated once per affected row.
      const ambiguousByName = new Map<string, { candidateCount: number; rowCount: number }>();
      for (const a of plan.ambiguous) {
        const existing = ambiguousByName.get(a.sellerName);
        if (existing) existing.rowCount++;
        else ambiguousByName.set(a.sellerName, { candidateCount: a.candidateSellerIds.length, rowCount: 1 });
      }
      const unmatchedByName = new Map<string, number>();
      for (const u of plan.unmatched) {
        unmatchedByName.set(u.sellerName, (unmatchedByName.get(u.sellerName) ?? 0) + 1);
      }

      result[table] = {
        alreadyHadSellerId: allRows.length - unresolved.length,
        matchedCount: plan.matched.length,
        appliedCount,
        ambiguous: [...ambiguousByName.entries()].map(([sellerName, v]) => ({
          sellerName,
          candidateCount: v.candidateCount,
          rowCount: v.rowCount,
        })),
        unmatched: [...unmatchedByName.entries()].map(([sellerName, rowCount]) => ({
          sellerName,
          rowCount,
        })),
      };
    }

    return NextResponse.json({ apply, ...result });
  } catch (err) {
    return errorResponse(err, "Couldn't run the seller_id backfill.");
  }
}
