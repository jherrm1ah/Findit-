// Pure decision logic for the seller_id backfill (see supabase/migrations/
// 009_seller_identity.sql). No DB access here on purpose — every rule that
// decides whether a row is safe to backfill lives in one place, is fully
// unit-testable, and can be trusted without hitting a real database.
//
// The problem this solves: products/orders/offers currently identify their
// seller by a plain text business-name string (see the `seller` column on
// each), and that name has no uniqueness constraint — two seller accounts
// can share a name today. So matching a text value back to a real seller
// account is not always a single obvious answer, and guessing wrong would
// silently attribute one seller's data to another. This module's whole job
// is to tell "safe to backfill automatically" apart from "needs a human to
// resolve" — and never blur the two.

export type SellerNameIndex = Map<string, string[]>;

export function buildSellerNameIndex(
  sellers: { id: string; name: string }[]
): SellerNameIndex {
  const index: SellerNameIndex = new Map();
  for (const seller of sellers) {
    const existing = index.get(seller.name);
    if (existing) {
      existing.push(seller.id);
    } else {
      index.set(seller.name, [seller.id]);
    }
  }
  return index;
}

export type SellerIdMatch =
  | { status: "matched"; sellerId: string }
  | { status: "ambiguous"; candidateSellerIds: string[] }
  | { status: "unmatched" };

// Exact match only, mirroring how the rest of the app already resolves a
// seller from a business name (see findUserByBusinessName in lib/auth.ts,
// which uses .eq() — not a fuzzy or case-insensitive comparison).
export function matchSellerIdByName(
  name: string,
  index: SellerNameIndex
): SellerIdMatch {
  const candidates = index.get(name);
  if (!candidates || candidates.length === 0) return { status: "unmatched" };
  if (candidates.length === 1) return { status: "matched", sellerId: candidates[0] };
  return { status: "ambiguous", candidateSellerIds: candidates };
}

export type BackfillCandidateRow = { id: string; sellerName: string };

export type BackfillPlan = {
  matched: { id: string; sellerId: string }[];
  ambiguous: { id: string; sellerName: string; candidateSellerIds: string[] }[];
  unmatched: { id: string; sellerName: string }[];
};

// Given the rows that still need a seller_id and the current seller
// accounts, decides exactly what's safe to write automatically. Only
// `matched` rows are ever meant to be written — `ambiguous` and `unmatched`
// are surfaced for a human to resolve, never guessed at.
export function planSellerIdBackfill(
  rows: BackfillCandidateRow[],
  sellers: { id: string; name: string }[]
): BackfillPlan {
  const index = buildSellerNameIndex(sellers);
  const plan: BackfillPlan = { matched: [], ambiguous: [], unmatched: [] };

  for (const row of rows) {
    const result = matchSellerIdByName(row.sellerName, index);
    if (result.status === "matched") {
      plan.matched.push({ id: row.id, sellerId: result.sellerId });
    } else if (result.status === "ambiguous") {
      plan.ambiguous.push({
        id: row.id,
        sellerName: row.sellerName,
        candidateSellerIds: result.candidateSellerIds,
      });
    } else {
      plan.unmatched.push({ id: row.id, sellerName: row.sellerName });
    }
  }

  return plan;
}

export type VerificationRow = { id: string; sellerName: string; sellerId: string | null };

export type VerificationReport = {
  total: number;
  withSellerId: number;
  withoutSellerId: number;
  // A row whose seller_id resolves back to a DIFFERENT name than the row's
  // own `seller` text — this should never happen if the backfill only ever
  // wrote unambiguous matches, so any entry here is a real bug to chase
  // down before trusting seller_id for anything user-facing.
  mismatched: { id: string; sellerName: string; resolvedName: string | null }[];
};

// sellerNamesById: what each seller_id currently resolves to, so a rename
// that happened AFTER a row was backfilled is caught too, not just bad
// matches from the backfill itself.
export function verifySellerIdIntegrity(
  rows: VerificationRow[],
  sellerNamesById: Map<string, string>
): VerificationReport {
  const report: VerificationReport = {
    total: rows.length,
    withSellerId: 0,
    withoutSellerId: 0,
    mismatched: [],
  };

  for (const row of rows) {
    if (!row.sellerId) {
      report.withoutSellerId++;
      continue;
    }
    report.withSellerId++;
    const resolvedName = sellerNamesById.get(row.sellerId) ?? null;
    if (resolvedName !== row.sellerName) {
      report.mismatched.push({ id: row.id, sellerName: row.sellerName, resolvedName });
    }
  }

  return report;
}

// A seller can manage (edit/delete) a listing or order only if it's really
// theirs. Comparing business names alone isn't enough: business_name has no
// uniqueness constraint (see the module comment above), so two sellers can
// share a name, and a name-only check would let either one touch the
// other's data. When both sides carry a reliable seller_id, that has to
// match too — it's the one thing a shared name can't fake. Rows created
// before seller_id existed (itemSellerId null) fall back to the name-only
// check, same as before this existed.
export function sellerOwnsItem(
  callerBusinessName: string | null,
  callerSellerId: string | null,
  itemSellerName: string,
  itemSellerId: string | null
): boolean {
  if (callerBusinessName !== itemSellerName) return false;
  if (itemSellerId && callerSellerId && itemSellerId !== callerSellerId) return false;
  return true;
}
