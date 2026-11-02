import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "../testing/fakeSupabase";
import type { ProfileInput } from "./store";

// Shipping profiles, locations and checkout against the fake Supabase client.

const fakeDb: FakeSupabase = createFakeSupabase();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => fakeDb }));
process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const store = await import("./store");
const { createProduct, createOrderFromProduct, setOrderDelivery, lockOrderDelivery, updateOrderStatus, confirmDelivery, listOrders } = await import("../repo");
const { confirmOrderPayment } = await import("../payments");

const now = () => new Date().toISOString();
const ADDR = { fullName: "Ada Obi", phone: "08031234567", address: "12 Herbert Macaulay Way", area: "Yaba", state: "Lagos", landmark: "" };

beforeEach(() => {
  fakeDb.reset({
    categories: [{ id: "electronics", label: "Electronics", icon_key: "Package", sort_order: 0, active: true, created_at: now(), updated_at: now() }],
    sellers: [{ id: "s1", user_id: "u_terra", name: "Terra Gadgets" }, { id: "s2", user_id: "u_kemi", name: "Kemi" }],
    users: [{ id: "buyer_1", role: "buyer", name: "Ada" }],
    shipping_profiles: [], shipping_zones: [], shipping_rates: [], seller_locations: [],
    subscription_plans: [], subscriptions: [],
  });
});

const PRICE_PROFILE = {
  name: "Standard",
  zones: [
    {
      name: "Lagos",
      states: ["Lagos"],
      rates: [
        { name: "Standard", method: "price", amount: 5000, maxOrder: 50000, etaMinDays: 1, etaMaxDays: 2 },
        { name: "Standard", method: "price", amount: 3000, minOrder: 50000, maxOrder: 100000, etaMinDays: 1, etaMaxDays: 2 },
        { name: "Standard", method: "price", amount: 0, minOrder: 100000, etaMinDays: 1, etaMaxDays: 2 },
        { name: "Express", method: "flat", amount: 7000, etaMinDays: 0, etaMaxDays: 0 },
      ],
    },
  ],
};

async function product(extra: Record<string, unknown> = {}, price = 40000) {
  const { shippingProfileId, ...rest } = extra;
  const p = await createProduct({
    category: "electronics", name: "Blender", price, seller: "Terra Gadgets", sellerId: null, condition: "New", qty: 10,
    deliveryOption: "Both", ...rest,
  } as Parameters<typeof createProduct>[0]);
  // createProduct with sellerId null skips the store-plan check (not under
  // test); give the listing its seller and profile like a real one.
  await fakeDb.from("products").update({ seller_id: "s1", shipping_profile_id: shippingProfileId ?? null }).eq("id", p.id);
  return p;
}
async function order(productId: string) {
  const o = await createOrderFromProduct(productId, 1, "buyer_1");
  await fakeDb.from("orders").update({ payment_status: "pending", escrow_status: "unpaid", seller_id: "s1" }).eq("id", o.id);
  return o;
}

describe("shipping profiles", () => {
  it("save with zones and rates; the first is the seller's default", async () => {
    const p = await store.saveShippingProfile("s1", PRICE_PROFILE as ProfileInput);
    expect(p).toMatchObject({ name: "Standard", isDefault: true });
    expect(p.zones[0].rates.map((r) => r.amount)).toEqual([5000, 3000, 0, 7000]);
    const cfg = await store.getShippingConfig("s1");
    expect(cfg.profiles).toHaveLength(1);
  });

  it("can't be edited or deleted by another seller", async () => {
    const p = await store.saveShippingProfile("s1", PRICE_PROFILE as ProfileInput);
    await expect(store.saveShippingProfile("s2", { ...(PRICE_PROFILE as ProfileInput), id: p.id })).rejects.toThrow(/isn't yours/);
    await expect(store.deleteShippingProfile("s2", p.id)).rejects.toThrow(/isn't yours/);
  });

  it("refuse nonsense: no zones, bad states, upside-down brackets", async () => {
    await expect(store.saveShippingProfile("s1", { name: "x", zones: [] })).rejects.toThrow(/at least one delivery zone/);
    await expect(store.saveShippingProfile("s1", { name: "x", zones: [{ name: "z", states: ["Atlantis"], rates: [{ name: "a", method: "flat", amount: 1 }] }] })).rejects.toThrow(/Nigerian state/);
    await expect(
      store.saveShippingProfile("s1", { name: "x", zones: [{ name: "z", states: ["*"], rates: [{ name: "a", method: "price", amount: 1, minOrder: 5000, maxOrder: 1000 }] }] })
    ).rejects.toThrow(/less than/);
  });
});

describe("checkout with a shipping profile", () => {
  it("offers the profile's rates for the address and charges the chosen one", async () => {
    const prof = await store.saveShippingProfile("s1", PRICE_PROFILE as ProfileInput);
    const p = await product({ shippingProfileId: prof.id });
    const o = await order(p.id);
    const quote = await store.quoteOrderShipping(o, { state: "Lagos", area: "Yaba" });
    expect(quote.ok && quote.options.map((x) => [x.name, x.fee])).toEqual([["Standard", 5000], ["Express", 7000]]);

    const express = quote.ok ? quote.options[1].id : "";
    const saved = (await setOrderDelivery(o.id, "buyer_1", { method: "delivery", address: ADDR, optionId: express }))!;
    expect(saved).toMatchObject({ deliveryFee: 7000, price: 47000, itemPrice: 40000 });
    expect(saved.shippingOption).toMatchObject({ name: "Express", method: "flat", etaMaxDays: 0, source: "manual" });
  });

  it("the seller's default profile prices listings that have no pricing of their own", async () => {
    await store.saveShippingProfile("s1", PRICE_PROFILE as ProfileInput);
    const p = await product({}, 60000);
    const o = await order(p.id);
    expect((await setOrderDelivery(o.id, "buyer_1", { method: "delivery", address: ADDR }))!.deliveryFee).toBe(3000);
  });

  it("a listing's own pricing wins over the default profile", async () => {
    await store.saveShippingProfile("s1", PRICE_PROFILE as ProfileInput);
    const p = await product({ deliveryPricing: "free" });
    const o = await order(p.id);
    expect((await setOrderDelivery(o.id, "buyer_1", { method: "delivery", address: ADDR }))!.deliveryFee).toBe(0);
  });

  it("refuses an address the seller doesn't deliver to, without inventing a fee", async () => {
    const prof = await store.saveShippingProfile("s1", PRICE_PROFILE as ProfileInput);
    const o = await order((await product({ shippingProfileId: prof.id })).id);
    await expect(setOrderDelivery(o.id, "buyer_1", { method: "delivery", address: { ...ADDR, state: "Kano", area: "Nassarawa" } })).rejects.toThrow(
      /doesn't deliver to Nassarawa, Kano/
    );
  });

  it("weight-based rates need the listing's weight", async () => {
    const prof = await store.saveShippingProfile("s1", {
      name: "Heavy", zones: [{ name: "All", states: ["*"], rates: [{ name: "Freight", method: "weight", amount: 3000, baseWeightG: 2000, perExtraKg: 1000 }] }],
    });
    const light = await order((await product({ shippingProfileId: prof.id })).id);
    await expect(setOrderDelivery(light.id, "buyer_1", { method: "delivery", address: ADDR })).rejects.toThrow(/weight/);
    const weighed = await order((await product({ shippingProfileId: prof.id, weightG: 4500 })).id);
    expect((await setOrderDelivery(weighed.id, "buyer_1", { method: "delivery", address: ADDR }))!).toMatchObject({ deliveryFee: 6000, packageWeightG: 4500 });
  });

  it("once paying starts, an address that changes the fee is refused", async () => {
    const prof = await store.saveShippingProfile("s1", {
      name: "Two", zones: [
        { name: "Lagos", states: ["Lagos"], rates: [{ name: "Rider", method: "local", amount: 2000 }] },
        { name: "Rest", states: ["*"], rates: [{ name: "Courier", method: "flat", amount: 6000 }] },
      ],
    });
    const o = await order((await product({ shippingProfileId: prof.id })).id);
    await setOrderDelivery(o.id, "buyer_1", { method: "delivery", address: ADDR });
    expect(await lockOrderDelivery(o.id, 42000)).toBe(true);
    await expect(setOrderDelivery(o.id, "buyer_1", { method: "delivery", address: { ...ADDR, state: "Oyo", area: "Bodija" } })).rejects.toThrow(/different amount/);
    expect((await setOrderDelivery(o.id, "buyer_1", { method: "delivery", address: { ...ADDR, landmark: "Blue gate" } }))!.deliveryFee).toBe(2000);
  });
});

describe("pickup locations", () => {
  it("need hours, and a buyer picks one when there are several", async () => {
    await expect(store.saveSellerLocation("s1", { name: "Shop", address: "4 Allen Avenue", area: "Ikeja", state: "Lagos", pickupEnabled: true })).rejects.toThrow(/pickup hours/);
    const a = await store.saveSellerLocation("s1", { name: "Ikeja shop", address: "4 Allen Avenue", area: "Ikeja", state: "Lagos", pickupEnabled: true, pickupHours: "Mon–Sat 9–6", pickupInstructions: "Ask for Tunde" });
    await store.saveSellerLocation("s1", { name: "Lekki shop", address: "1 Admiralty Way", area: "Lekki", state: "Lagos", pickupEnabled: true, pickupHours: "Mon–Fri 10–5" });
    const o = await order((await product({ deliveryPricing: "free" })).id);
    await expect(setOrderDelivery(o.id, "buyer_1", { method: "pickup" })).rejects.toThrow(/Choose where/);
    const saved = (await setOrderDelivery(o.id, "buyer_1", { method: "pickup", pickupLocationId: a.id }))!;
    expect(saved).toMatchObject({ deliveryFee: 0, pickupStatus: "awaiting" });
    expect(saved.pickupLocation).toMatchObject({ name: "Ikeja shop", hours: "Mon–Sat 9–6", instructions: "Ask for Tunde" });
  });

  it("belong to their seller", async () => {
    const a = await store.saveSellerLocation("s1", { name: "Shop", address: "4 Allen Avenue", area: "Ikeja", state: "Lagos" });
    await expect(store.deleteSellerLocation("s2", a.id)).rejects.toThrow(/isn't yours/);
  });
});

describe("shipments and tracking", () => {
  async function paidOrder(method: "delivery" | "pickup") {
    const p = await product({ deliveryPricing: "fixed", deliveryFee: 2500 });
    const o = await order(p.id);
    if (method === "pickup") await store.saveSellerLocation("s1", { name: "Ikeja shop", address: "4 Allen Avenue", area: "Ikeja", state: "Lagos", pickupEnabled: true, pickupHours: "Mon–Sat 9–6" });
    await setOrderDelivery(o.id, "buyer_1", method === "delivery" ? { method, address: ADDR } : { method });
    fakeDb.dump("platform_fee_config").length || (await fakeDb.from("platform_fee_config").insert({ id: "fee", fee_bps: 500, created_at: now() }));
    await confirmOrderPayment(o.id);
    return o;
  }

  it("follows the order: sent with tracking, out for delivery, delivered", async () => {
    const o = await paidOrder("delivery");
    await updateOrderStatus(o.id, "Dispatched", { carrier: "GIG Logistics", trackingNumber: "GIG123", trackingUrl: "https://giglogistics.com/track/GIG123" });
    await updateOrderStatus(o.id, "Out for delivery");
    await confirmDelivery(o.id, "buyer_1");
    const [mine] = await listOrders("buyer_1");
    expect(mine.shipment).toMatchObject({ carrier: "GIG Logistics", trackingNumber: "GIG123", status: "delivered" });
    expect(mine.shipment!.events.map((e) => e.status)).toEqual(["in_transit", "out_for_delivery", "delivered"]);
  });

  it("refuses a tracking link that isn't https", async () => {
    const o = await paidOrder("delivery");
    await expect(updateOrderStatus(o.id, "Dispatched", { trackingUrl: "javascript:alert(1)" })).rejects.toThrow(/https/);
  });

  it("pickup: ready to collect, then collected", async () => {
    const o = await paidOrder("pickup");
    const ready = (await updateOrderStatus(o.id, "Dispatched"))!;
    expect(ready.pickupStatus).toBe("ready");
    expect(fakeDb.dump("notifications").some((n) => n.title === "Ready to collect" && String(n.body).includes("Ikeja shop"))).toBe(true);
    expect((await confirmDelivery(o.id, "buyer_1"))!.pickupStatus).toBe("collected");
    expect(fakeDb.dump("shipments")).toHaveLength(0);
  });
});
