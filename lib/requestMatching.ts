// Who gets told about a new buyer request — the actual decision logic,
// pulled out of the database call so it can be tested without one. The
// database side only ever answers "which sellers are candidates"; this
// function decides which of them actually get notified.

export type RequestNotifyCandidate = {
  // The seller's owning ACCOUNT id (users.id) — this is who the
  // notification actually goes to, not the sellers-table row id.
  sellerUserId: string;
  sellerId: string | null;
  sellerName: string;
};

// A hard cap, applied regardless of how a request matched. Category-matched
// candidates are already real evidence (an active listing in that
// category), so this rarely bites there; it exists mainly for the "buyer
// wasn't sure" path, which notifies every approved seller and would
// otherwise grow unbounded as the seller base does. Easy to raise later —
// there is no cron or queue behind this to redesign, just this number.
export const MAX_REQUEST_NOTIFY_RECIPIENTS = 50;

// Pure: dedupes candidates (a seller can only be told once about the same
// request, however many product rows matched), excludes the requester
// themselves (a seller who posts a request must never be notified about
// their own post), and applies the cap. Order is preserved from the input,
// so the caller controls priority by how it orders the query.
export function sellersToNotifyForNewRequest(
  candidates: RequestNotifyCandidate[],
  requestingUserId: string,
  maxRecipients: number = MAX_REQUEST_NOTIFY_RECIPIENTS
): RequestNotifyCandidate[] {
  const seen = new Set<string>();
  const out: RequestNotifyCandidate[] = [];

  for (const candidate of candidates) {
    if (candidate.sellerUserId === requestingUserId) continue;

    // seller_id is the reliable key when present; a legacy row with none
    // falls back to name, same reasoning as computeSellerStatsMap and
    // matchSellerIdByName elsewhere — two real sellers could still share a
    // name, but that only produces one extra (harmless) skipped duplicate
    // here, never a wrong notification going to the wrong account.
    const key = candidate.sellerId ?? `name:${candidate.sellerName}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push(candidate);
    if (out.length >= maxRecipients) break;
  }

  return out;
}
