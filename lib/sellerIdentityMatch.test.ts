import { describe, it, expect } from "vitest";
import {
  buildSellerNameIndex,
  matchSellerIdByName,
  planSellerIdBackfill,
  verifySellerIdIntegrity,
} from "./sellerIdentityMatch";

// This is the logic the whole "do not break existing data" promise rests
// on: it decides which rows are safe to backfill automatically and which
// need a human, and it must never guess. Every case here is a case where
// guessing wrong would silently attribute one seller's data to another.

describe("buildSellerNameIndex / matchSellerIdByName", () => {
  it("matches a name that belongs to exactly one seller", () => {
    const index = buildSellerNameIndex([{ id: "s1", name: "Chidi Electronics" }]);
    expect(matchSellerIdByName("Chidi Electronics", index)).toEqual({
      status: "matched",
      sellerId: "s1",
    });
  });

  it("refuses to guess when two sellers share a name", () => {
    const index = buildSellerNameIndex([
      { id: "s1", name: "Chidi Electronics" },
      { id: "s2", name: "Chidi Electronics" },
    ]);
    const result = matchSellerIdByName("Chidi Electronics", index);
    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.candidateSellerIds.sort()).toEqual(["s1", "s2"]);
    }
  });

  it("reports unmatched rather than guessing at a close name", () => {
    const index = buildSellerNameIndex([{ id: "s1", name: "Chidi Electronics" }]);
    expect(matchSellerIdByName("chidi electronics", index)).toEqual({ status: "unmatched" });
    expect(matchSellerIdByName("Chidi Electronics ", index)).toEqual({ status: "unmatched" });
    expect(matchSellerIdByName("Someone Else", index)).toEqual({ status: "unmatched" });
  });

  it("handles an empty seller list", () => {
    const index = buildSellerNameIndex([]);
    expect(matchSellerIdByName("Anyone", index)).toEqual({ status: "unmatched" });
  });
});

describe("planSellerIdBackfill", () => {
  const sellers = [
    { id: "s1", name: "Chidi Electronics" },
    { id: "s2", name: "Amaka Solar Supplies" },
    { id: "s3", name: "Duplicate Name" },
    { id: "s4", name: "Duplicate Name" },
  ];

  it("separates matched, ambiguous, and unmatched rows correctly", () => {
    const plan = planSellerIdBackfill(
      [
        { id: "p1", sellerName: "Chidi Electronics" },
        { id: "p2", sellerName: "Amaka Solar Supplies" },
        { id: "p3", sellerName: "Duplicate Name" },
        { id: "p4", sellerName: "No Such Seller" },
      ],
      sellers
    );

    expect(plan.matched).toEqual([
      { id: "p1", sellerId: "s1" },
      { id: "p2", sellerId: "s2" },
    ]);
    expect(plan.ambiguous).toEqual([
      { id: "p3", sellerName: "Duplicate Name", candidateSellerIds: ["s3", "s4"] },
    ]);
    expect(plan.unmatched).toEqual([{ id: "p4", sellerName: "No Such Seller" }]);
  });

  it("never produces overlapping rows between the three buckets", () => {
    const rows = [
      { id: "p1", sellerName: "Chidi Electronics" },
      { id: "p2", sellerName: "Duplicate Name" },
      { id: "p3", sellerName: "Ghost Seller" },
    ];
    const plan = planSellerIdBackfill(rows, sellers);
    const matchedIds = plan.matched.map((r) => r.id);
    const ambiguousIds = plan.ambiguous.map((r) => r.id);
    const unmatchedIds = plan.unmatched.map((r) => r.id);
    const all = [...matchedIds, ...ambiguousIds, ...unmatchedIds];
    expect(all.sort()).toEqual(["p1", "p2", "p3"]);
    expect(new Set(all).size).toBe(all.length); // no row appears twice
  });

  it("returns an empty plan for no rows", () => {
    expect(planSellerIdBackfill([], sellers)).toEqual({
      matched: [],
      ambiguous: [],
      unmatched: [],
    });
  });
});

describe("verifySellerIdIntegrity", () => {
  it("counts rows with and without seller_id", () => {
    const report = verifySellerIdIntegrity(
      [
        { id: "p1", sellerName: "Chidi Electronics", sellerId: "s1" },
        { id: "p2", sellerName: "Amaka Solar Supplies", sellerId: null },
      ],
      new Map([["s1", "Chidi Electronics"]])
    );
    expect(report.total).toBe(2);
    expect(report.withSellerId).toBe(1);
    expect(report.withoutSellerId).toBe(1);
    expect(report.mismatched).toEqual([]);
  });

  it("flags a row whose seller_id resolves to a different name than its text field", () => {
    // This should never happen if the backfill only ever wrote unambiguous
    // matches — any hit here is a real bug to chase down, not noise.
    const report = verifySellerIdIntegrity(
      [{ id: "p1", sellerName: "Old Name", sellerId: "s1" }],
      new Map([["s1", "New Name"]])
    );
    expect(report.mismatched).toEqual([
      { id: "p1", sellerName: "Old Name", resolvedName: "New Name" },
    ]);
  });

  it("flags a seller_id that doesn't resolve to any known seller as a mismatch", () => {
    const report = verifySellerIdIntegrity(
      [{ id: "p1", sellerName: "Chidi Electronics", sellerId: "gone" }],
      new Map()
    );
    expect(report.mismatched).toEqual([
      { id: "p1", sellerName: "Chidi Electronics", resolvedName: null },
    ]);
  });

  it("does NOT flag a rename as a mismatch when seller_id already carries it correctly", () => {
    // The whole point of seller_id: it survives a rename automatically,
    // because it points at the account, not the (mutable) name.
    const report = verifySellerIdIntegrity(
      [{ id: "p1", sellerName: "New Name", sellerId: "s1" }],
      new Map([["s1", "New Name"]])
    );
    expect(report.mismatched).toEqual([]);
  });
});
