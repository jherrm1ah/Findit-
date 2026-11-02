import { describe, it, expect } from "vitest";
import { matchZone, quoteShipping, rateFee, inlineProfile, profileSummary, etaText, type ShippingProfile, type QuoteLine } from "./engine";

const LAGOS = { state: "Lagos", area: "Yaba" };
const line = (profile: ShippingProfile, unitPrice: number, extra: Partial<QuoteLine> = {}): QuoteLine => ({
  productId: "p1", qty: 1, unitPrice, weightG: null, profile, ...extra,
});

// The spec's own example: below ₦50,000 ₦5,000; ₦50,000–₦100,000 ₦3,000; above free.
const priceBased: ShippingProfile = {
  id: "prof_price", name: "By order value",
  zones: [{ id: "z1", name: "Nigeria", states: ["*"], areas: [], rates: [
    { id: "r_lo", name: "Standard", method: "price", amount: 5000, maxOrder: 50000, etaMinDays: 2, etaMaxDays: 4 },
    { id: "r_mid", name: "Standard", method: "price", amount: 3000, minOrder: 50000, maxOrder: 100000, etaMinDays: 2, etaMaxDays: 4 },
    { id: "r_hi", name: "Standard", method: "free", amount: 0, minOrder: 100000, etaMinDays: 2, etaMaxDays: 4 },
  ] }],
};
// "free" rates ignore minOrder by design; price-based free brackets use method "price" with amount 0.
priceBased.zones[0].rates[2] = { id: "r_hi", name: "Standard", method: "price", amount: 0, minOrder: 100000, etaMinDays: 2, etaMaxDays: 4 };

describe("price-based shipping", () => {
  it("charges by order value bracket", () => {
    const fee = (v: number) => (quoteShipping([line(priceBased, v)], LAGOS) as { options: { fee: number }[] }).options[0].fee;
    expect(fee(49_999)).toBe(5000);
    expect(fee(50_000)).toBe(3000);
    expect(fee(99_999)).toBe(3000);
    expect(fee(100_000)).toBe(0);
  });
});

describe("weight-based shipping", () => {
  const byWeight: ShippingProfile = {
    id: "prof_w", name: "By weight",
    zones: [{ id: "z", name: "Nigeria", states: ["*"], areas: [], rates: [
      { id: "light", name: "Parcel", method: "weight", amount: 2000, maxWeightG: 5000, baseWeightG: 1000, perExtraKg: 500 },
      { id: "heavy", name: "Freight", method: "weight", amount: 8000, minWeightG: 5001 },
    ] }],
  };
  it("charges a minimum, then per extra kilogram started", () => {
    expect(rateFee(byWeight.zones[0].rates[0], 800)).toBe(2000);
    expect(rateFee(byWeight.zones[0].rates[0], 1001)).toBe(2500);
    expect(rateFee(byWeight.zones[0].rates[0], 3200)).toBe(3500);
  });
  it("picks the bracket for the whole package (weight × quantity)", () => {
    const q = quoteShipping([line(byWeight, 1000, { weightG: 3000, qty: 2 })], LAGOS);
    expect(q.ok && q.options.map((o) => o.id)).toEqual(["heavy"]);
  });
  it("never guesses a missing weight", () => {
    const q = quoteShipping([line(byWeight, 1000)], LAGOS);
    expect(q).toMatchObject({ ok: false, reason: "needs_weight" });
  });
});

describe("zones and local delivery", () => {
  const local: ShippingProfile = {
    id: "prof_l", name: "Local",
    zones: [
      { id: "island", name: "Lagos Island", states: ["Lagos"], areas: ["Lekki", "Victoria Island", "Ikoyi"], rates: [{ id: "r_island", name: "Rider", method: "local", amount: 3500, etaMinDays: 0, etaMaxDays: 1 }] },
      { id: "lagos", name: "Lagos", states: ["Lagos"], areas: [], rates: [{ id: "r_lagos", name: "Rider", method: "local", amount: 2500, etaMinDays: 1, etaMaxDays: 1 }] },
      { id: "sw", name: "South West", states: ["Ogun", "Oyo"], areas: [], rates: [{ id: "r_sw", name: "Courier", method: "flat", amount: 4000, etaMinDays: 2, etaMaxDays: 3 }] },
    ],
  };
  it("matches the most specific zone: area, then state", () => {
    expect(matchZone(local, { state: "Lagos", area: "Lekki Phase 1" })?.id).toBe("island");
    expect(matchZone(local, { state: "Lagos", area: "Yaba" })?.id).toBe("lagos");
    expect(matchZone(local, { state: "Oyo", area: "Bodija" })?.id).toBe("sw");
  });
  it("doesn't match part of a word", () => {
    expect(matchZone(local, { state: "Lagos", area: "Ikoyitown" })?.id).toBe("lagos");
  });
  it("offers nothing where the seller doesn't deliver, and says so", () => {
    expect(quoteShipping([line(local, 1000)], { state: "Kano", area: "Nassarawa" })).toMatchObject({ ok: false, reason: "no_zone", message: "This seller doesn't deliver to Nassarawa, Kano." });
  });
});

describe("free shipping threshold", () => {
  const flat: ShippingProfile = {
    id: "prof_f", name: "Flat", freeShippingOver: 30000,
    zones: [{ id: "z", name: "Nigeria", states: ["*"], areas: [], rates: [{ id: "std", name: "Standard", method: "flat", amount: 2500 }] }],
  };
  it("makes every rate free from the threshold up, and says why", () => {
    const below = quoteShipping([line(flat, 29_999)], LAGOS);
    const above = quoteShipping([line(flat, 30_000)], LAGOS);
    expect(below.ok && below.options[0]).toMatchObject({ fee: 2500, freeOver: null });
    expect(above.ok && above.options[0]).toMatchObject({ fee: 0, freeOver: 30000 });
  });
});

describe("several profiles in one seller-order", () => {
  const a: ShippingProfile = { id: "a", name: "A", zones: [{ id: "za", name: "Nigeria", states: ["*"], areas: [], rates: [
    { id: "a1", name: "Standard", method: "flat", amount: 2000, etaMinDays: 1, etaMaxDays: 2 },
    { id: "a2", name: "Express", method: "flat", amount: 5000, etaMinDays: 0, etaMaxDays: 1 },
  ] }] };
  const b: ShippingProfile = { id: "b", name: "B", zones: [{ id: "zb", name: "Nigeria", states: ["*"], areas: [], rates: [{ id: "b1", name: "Freight", method: "flat", amount: 6000, etaMinDays: 3, etaMaxDays: 5 }] }] };
  it("adds up each profile's cheapest rate, delivered when the slowest arrives", () => {
    const q = quoteShipping([line(a, 1000, { productId: "x" }), line(b, 1000, { productId: "y" })], LAGOS);
    expect(q.ok && q.options).toEqual([expect.objectContaining({ method: "combined", fee: 8000, etaMinDays: 3, etaMaxDays: 5 })]);
  });
  it("one profile: every rate is an option, cheapest first", () => {
    const q = quoteShipping([line(a, 1000)], LAGOS);
    expect(q.ok && q.options.map((o) => o.name)).toEqual(["Standard", "Express"]);
  });
});

describe("a listing's own simple pricing", () => {
  it("free, fixed and by-state become profiles", () => {
    const free = quoteShipping([line(inlineProfile({ id: "p", deliveryPricing: "free", deliveryFee: 0, deliveryRates: null }), 1000)], LAGOS);
    expect(free.ok && free.options[0]).toMatchObject({ fee: 0, method: "free" });
    const byState = inlineProfile({ id: "p", deliveryPricing: "location", deliveryFee: 6000, deliveryRates: { Lagos: 2500 } });
    const toLagos = quoteShipping([line(byState, 1000)], LAGOS);
    const toKano = quoteShipping([line(byState, 1000)], { state: "Kano" });
    expect(toLagos.ok && toLagos.options[0].fee).toBe(2500);
    expect(toKano.ok && toKano.options[0].fee).toBe(6000);
  });
  it("an older listing with nothing chosen is ₦0 and marked unset", () => {
    const q = quoteShipping([line(inlineProfile({ id: "p", deliveryPricing: null, deliveryFee: 0, deliveryRates: null }), 1000)], LAGOS);
    expect(q.ok && q.options[0]).toMatchObject({ fee: 0, unset: true });
  });
});

describe("wording", () => {
  it("summarises a profile for the product page", () => {
    expect(profileSummary(inlineProfile({ id: "p", deliveryPricing: "free", deliveryFee: 0, deliveryRates: null }))).toBe("Free delivery");
    expect(profileSummary(priceBased)).toBe("Free delivery available");
    expect(profileSummary({ id: "x", name: "x", freeShippingOver: 50000, zones: [{ id: "z", name: "n", states: ["*"], areas: [], rates: [{ id: "r", name: "s", method: "flat", amount: 2000 }] }] })).toBe("Free delivery over ₦50,000");
    expect(profileSummary({ id: "x", name: "x", zones: [{ id: "z", name: "n", states: ["*"], areas: [], rates: [{ id: "r", name: "s", method: "weight", amount: 2000 }] }] })).toBe("Delivery priced by weight at checkout");
  });
  it("describes delivery estimates", () => {
    expect(etaText({ etaMinDays: 1, etaMaxDays: 3 })).toBe("Arrives in 1–3 days");
    expect(etaText({ etaMinDays: 1, etaMaxDays: 1 })).toBe("Arrives tomorrow");
    expect(etaText({ etaMinDays: 0, etaMaxDays: 0 })).toBe("Arrives today");
    expect(etaText({ etaMinDays: null, etaMaxDays: null })).toBeNull();
  });
});
