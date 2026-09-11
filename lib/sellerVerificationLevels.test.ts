import { describe, it, expect } from "vitest";
import { computeVerificationLevel, canSubmitVerification } from "./sellerVerificationLevels";

// The core trust promise: never claim a level FindIt hasn't actually
// earned/reviewed. A seller who racks up orders without ever being
// reviewed stays "New," and "Trusted" requires a real track record on top
// of an actual admin approval — not either alone.
describe("computeVerificationLevel", () => {
  it("is 'new' for a seller who hasn't been reviewed at all", () => {
    expect(
      computeVerificationLevel({ verificationStatus: "incomplete", orderCount: 50, disputeCount: 0, avgRating: 5 })
    ).toBe("new");
  });

  it("is 'new' while a submission is pending or needs more info, no matter the order history", () => {
    expect(computeVerificationLevel({ verificationStatus: "pending", orderCount: 50, disputeCount: 0, avgRating: 5 })).toBe("new");
    expect(computeVerificationLevel({ verificationStatus: "needs_info", orderCount: 50, disputeCount: 0, avgRating: 5 })).toBe("new");
    expect(computeVerificationLevel({ verificationStatus: "rejected", orderCount: 50, disputeCount: 0, avgRating: 5 })).toBe("new");
  });

  it("is 'verified' once approved, even with zero orders yet", () => {
    expect(
      computeVerificationLevel({ verificationStatus: "approved", orderCount: 0, disputeCount: 0, avgRating: null })
    ).toBe("verified");
  });

  it("is 'trusted' only once approved AND a real track record clears every bar", () => {
    expect(
      computeVerificationLevel({ verificationStatus: "approved", orderCount: 10, disputeCount: 0, avgRating: 4 })
    ).toBe("trusted");
  });

  it("stays 'verified' below the order threshold", () => {
    expect(
      computeVerificationLevel({ verificationStatus: "approved", orderCount: 9, disputeCount: 0, avgRating: 5 })
    ).toBe("verified");
  });

  it("a single dispute blocks 'trusted' even with plenty of orders and a perfect rating", () => {
    expect(
      computeVerificationLevel({ verificationStatus: "approved", orderCount: 50, disputeCount: 1, avgRating: 5 })
    ).toBe("verified");
  });

  it("a rating below the bar blocks 'trusted'", () => {
    expect(
      computeVerificationLevel({ verificationStatus: "approved", orderCount: 20, disputeCount: 0, avgRating: 3.5 })
    ).toBe("verified");
  });

  it("no reviews yet (null rating) doesn't block 'trusted' — absence of data isn't a bad rating", () => {
    expect(
      computeVerificationLevel({ verificationStatus: "approved", orderCount: 10, disputeCount: 0, avgRating: null })
    ).toBe("trusted");
  });
});

describe("canSubmitVerification", () => {
  const base = { sellerType: "home_based", category: "Electronics", hasPhysicalStore: false, shopAddress: null, evidenceCount: 1 };

  it("passes with a minimal, legitimate home-based submission", () => {
    expect(canSubmitVerification(base)).toEqual({ ok: true });
  });

  it("rejects with no seller type chosen", () => {
    expect(canSubmitVerification({ ...base, sellerType: null }).ok).toBe(false);
  });

  it("rejects with nothing said about what they sell", () => {
    expect(canSubmitVerification({ ...base, category: "" }).ok).toBe(false);
    expect(canSubmitVerification({ ...base, category: "   " }).ok).toBe(false);
  });

  it("rejects when hasPhysicalStore was never answered", () => {
    expect(canSubmitVerification({ ...base, hasPhysicalStore: null }).ok).toBe(false);
  });

  it("requires a shop address only when they said they have a physical store", () => {
    expect(canSubmitVerification({ ...base, hasPhysicalStore: true, shopAddress: null }).ok).toBe(false);
    expect(canSubmitVerification({ ...base, hasPhysicalStore: true, shopAddress: "12 Allen Ave" }).ok).toBe(true);
  });

  it("rejects with zero evidence — the one real anti-anonymity bar", () => {
    expect(canSubmitVerification({ ...base, evidenceCount: 0 }).ok).toBe(false);
  });
});
