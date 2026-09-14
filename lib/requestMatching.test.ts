import { describe, it, expect } from "vitest";
import { sellersToNotifyForNewRequest, MAX_REQUEST_NOTIFY_RECIPIENTS } from "./requestMatching";

function candidate(overrides: Partial<Parameters<typeof sellersToNotifyForNewRequest>[0][number]> = {}) {
  return {
    sellerUserId: "u_seller_1",
    sellerId: "seller_1",
    sellerName: "Terra Gadgets",
    ...overrides,
  };
}

describe("sellersToNotifyForNewRequest", () => {
  it("notifies a plain candidate", () => {
    const result = sellersToNotifyForNewRequest([candidate()], "u_buyer");
    expect(result).toHaveLength(1);
    expect(result[0].sellerUserId).toBe("u_seller_1");
  });

  it("never notifies the person who posted the request", () => {
    const self = candidate({ sellerUserId: "u_buyer" });
    const result = sellersToNotifyForNewRequest([self, candidate()], "u_buyer");
    expect(result.map((r) => r.sellerUserId)).toEqual(["u_seller_1"]);
  });

  it("dedupes a seller who matched more than once (e.g. two products in the category)", () => {
    const dup = [candidate(), candidate()];
    const result = sellersToNotifyForNewRequest(dup, "u_buyer");
    expect(result).toHaveLength(1);
  });

  it("dedupes by name when seller_id is null (a legacy pre-backfill listing)", () => {
    const dup = [
      candidate({ sellerId: null, sellerName: "Kemi's Kitchen" }),
      candidate({ sellerId: null, sellerName: "Kemi's Kitchen" }),
    ];
    expect(sellersToNotifyForNewRequest(dup, "u_buyer")).toHaveLength(1);
  });

  it("treats a null seller_id and a real seller_id with the same name as different sellers", () => {
    // The whole point of seller_id existing: a name collision must never
    // merge two distinct accounts into one notification target.
    const result = sellersToNotifyForNewRequest(
      [
        candidate({ sellerId: "seller_1", sellerName: "Shopera", sellerUserId: "u_1" }),
        candidate({ sellerId: "seller_2", sellerName: "Shopera", sellerUserId: "u_2" }),
      ],
      "u_buyer"
    );
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.sellerUserId).sort()).toEqual(["u_1", "u_2"]);
  });

  it("respects the cap", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      candidate({ sellerUserId: `u_${i}`, sellerId: `seller_${i}`, sellerName: `Seller ${i}` })
    );
    expect(sellersToNotifyForNewRequest(many, "u_buyer", 3)).toHaveLength(3);
  });

  it("defaults to the exported cap constant", () => {
    const many = Array.from({ length: MAX_REQUEST_NOTIFY_RECIPIENTS + 20 }, (_, i) =>
      candidate({ sellerUserId: `u_${i}`, sellerId: `seller_${i}`, sellerName: `Seller ${i}` })
    );
    expect(sellersToNotifyForNewRequest(many, "u_buyer")).toHaveLength(MAX_REQUEST_NOTIFY_RECIPIENTS);
  });

  it("returns nothing for an empty candidate list", () => {
    expect(sellersToNotifyForNewRequest([], "u_buyer")).toEqual([]);
  });

  it("returns nothing when the only candidate is the requester", () => {
    expect(sellersToNotifyForNewRequest([candidate({ sellerUserId: "u_buyer" })], "u_buyer")).toEqual([]);
  });

  it("preserves input order, so the caller's query order decides priority under the cap", () => {
    const ordered = [
      candidate({ sellerUserId: "u_a", sellerId: "a", sellerName: "A" }),
      candidate({ sellerUserId: "u_b", sellerId: "b", sellerName: "B" }),
    ];
    const result = sellersToNotifyForNewRequest(ordered, "u_buyer", 1);
    expect(result[0].sellerUserId).toBe("u_a");
  });
});
