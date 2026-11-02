import { describe, it, expect } from "vitest";
import { setupSteps } from "./sellerSetup";

const fresh = { user: { avatarUrl: null }, storeBranding: null, verification: { status: "incomplete" }, myListings: [], payoutAccount: { hasAccount: false }, myOrders: [] };
const done = (steps: ReturnType<typeof setupSteps>) => steps.filter((s) => s.done).map((s) => s.key);

describe("seller setup steps", () => {
  it("start with nothing done for a new seller, in a sensible order", () => {
    const steps = setupSteps(fresh);
    expect(steps.map((s) => s.key)).toEqual(["photo", "verify", "listing", "delivery", "payout", "sale"]);
    expect(done(steps)).toEqual([]);
  });

  it("tick themselves off from the seller's real data", () => {
    const steps = setupSteps({
      user: { avatarUrl: null },
      storeBranding: { logoUrl: "https://x/logo.png" },
      verification: { status: "approved" },
      myListings: [{ deliveryOption: "Both", deliveryPricing: "free" }, { deliveryOption: "Pickup", deliveryPricing: null }],
      payoutAccount: { hasAccount: true },
      myOrders: [{ paymentStatus: "pending" }, { paymentStatus: "paid" }],
    });
    expect(done(steps)).toEqual(["photo", "verify", "listing", "delivery", "payout", "sale"]);
  });

  it("delivery pricing isn't done while a listing still has none", () => {
    const steps = setupSteps({ ...fresh, myListings: [{ deliveryOption: "Delivery", deliveryPricing: null }] });
    expect(done(steps)).toContain("listing");
    expect(done(steps)).not.toContain("delivery");
  });

  it("an unpaid order isn't a sale yet", () => {
    expect(done(setupSteps({ ...fresh, myOrders: [{ paymentStatus: "pending" }] }))).not.toContain("sale");
  });

  it("show verification under review as waiting, with nothing to tap", () => {
    const verify = setupSteps({ ...fresh, verification: { status: "pending" } }).find((s) => s.key === "verify")!;
    expect(verify).toMatchObject({ done: false, waiting: true, action: null });
  });

  it("each open step has the one action that does it", () => {
    const actions = Object.fromEntries(setupSteps(fresh).map((s) => [s.key, s.action]));
    expect(actions.photo).toMatchObject({ to: "profile" });
    expect(actions.verify).toMatchObject({ to: "sellerOnboarding", label: "Start verification" });
    expect(actions.listing).toMatchObject({ tab: "listings", addListing: true });
    expect(actions.payout).toMatchObject({ tab: "store" });
    expect(actions.sale).toMatchObject({ tab: "requests" });
  });
});
