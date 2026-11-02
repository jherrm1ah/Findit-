import { describe, it, expect } from "vitest";
import { addressLines, deliveryChoices, deliveryTermsText, normalizeAddress, orderPriceFor, parseDeliveryFee } from "./delivery";
import { computeFeeSplit } from "./payments";

const address = {
  fullName: "  Ada   Obi ",
  phone: "0803 123 4567",
  address: "12 Herbert Macaulay Way",
  area: "Yaba",
  state: "Lagos",
  landmark: "",
};

describe("deliveryChoices", () => {
  it("follows the seller's option, and lets older listings/offers choose either", () => {
    expect(deliveryChoices("Delivery")).toEqual({ delivery: true, pickup: false });
    expect(deliveryChoices("Pickup")).toEqual({ delivery: false, pickup: true });
    expect(deliveryChoices("Both")).toEqual({ delivery: true, pickup: true });
    expect(deliveryChoices(null)).toEqual({ delivery: true, pickup: true });
  });
});

describe("parseDeliveryFee", () => {
  it("reads whole naira, with or without ₦ and commas, and blank as free", () => {
    expect(parseDeliveryFee(2500)).toBe(2500);
    expect(parseDeliveryFee("₦2,500")).toBe(2500);
    expect(parseDeliveryFee("")).toBe(0);
    expect(parseDeliveryFee(undefined)).toBe(0);
  });

  it("refuses negative, fractional, non-numbers and absurd amounts", () => {
    for (const bad of [-1, 10.5, "abc", 2_000_000]) expect(() => parseDeliveryFee(bad)).toThrow();
  });
});

describe("orderPriceFor", () => {
  it("adds the fee only when delivered", () => {
    expect(orderPriceFor(10000, "delivery", 2500)).toEqual({ deliveryFee: 2500, price: 12500 });
    expect(orderPriceFor(10000, "pickup", 2500)).toEqual({ deliveryFee: 0, price: 10000 });
  });
});

describe("deliveryTermsText", () => {
  it("describes an offer's delivery for the buyer", () => {
    expect(deliveryTermsText("Delivery", 2500)).toBe("Delivery ₦2,500");
    expect(deliveryTermsText("Delivery", 0)).toBe("Free delivery");
    expect(deliveryTermsText("Both", 1500)).toBe("Delivery ₦1,500 or pickup");
    expect(deliveryTermsText("Pickup", 1500)).toBe("Pickup only");
  });
});

describe("normalizeAddress", () => {
  it("tidies spacing and treats an empty landmark as none", () => {
    expect(normalizeAddress(address)).toEqual({
      fullName: "Ada Obi",
      phone: "0803 123 4567",
      address: "12 Herbert Macaulay Way",
      area: "Yaba",
      state: "Lagos",
      landmark: null,
    });
  });

  it("explains exactly what's missing", () => {
    expect(() => normalizeAddress({ ...address, fullName: "" })).toThrow(/name/);
    expect(() => normalizeAddress({ ...address, phone: "123" })).toThrow(/phone/);
    expect(() => normalizeAddress({ ...address, address: "" })).toThrow(/street/);
    expect(() => normalizeAddress({ ...address, area: "" })).toThrow(/area/);
    expect(() => normalizeAddress({ ...address, state: "Atlantis" })).toThrow(/state/);
    expect(() => normalizeAddress(null)).toThrow();
  });

  it("lists it as lines for the seller", () => {
    expect(addressLines({ ...normalizeAddress(address), landmark: "Blue gate" })).toEqual([
      "Ada Obi",
      "12 Herbert Macaulay Way",
      "Yaba, Lagos",
      "Landmark: Blue gate",
      "0803 123 4567",
    ]);
    expect(addressLines(null)).toEqual([]);
  });
});

describe("computeFeeSplit with a delivery fee", () => {
  it("charges the platform fee on the item only; the seller keeps the whole delivery fee", () => {
    // ₦10,000 item + ₦2,000 delivery at 5%: fee 500, seller 11,500.
    expect(computeFeeSplit(12000, 500, 2000)).toEqual({ feeAmount: 500, payoutAmount: 11500 });
  });

  it("still always adds up to the price", () => {
    const { feeAmount, payoutAmount } = computeFeeSplit(10999, 750, 1500);
    expect(feeAmount + payoutAmount).toBe(10999);
  });
});
