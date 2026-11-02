import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";

// Delivery at checkout (migration 043), end to end against the fake
// Supabase client: a listing's delivery fee carried onto the order, the
// buyer choosing delivery or pickup, the price fixed once they start paying,
// the platform fee charged on the item only, and the buyer's address kept
// from the seller until the order is paid.

const fakeDb: FakeSupabase = createFakeSupabase();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => fakeDb }));
process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const { createProduct, updateProduct, createOrderFromProduct, createOrdersFromCart, setOrderDelivery, lockOrderDelivery, listOrders, acceptOffer, getOrder } =
  await import("./repo");
const { confirmOrderPayment } = await import("./payments");

const now = () => new Date().toISOString();
const ADDRESS = { fullName: "Ada Obi", phone: "08031234567", address: "12 Herbert Macaulay Way", area: "Yaba", state: "Lagos", landmark: "Blue gate" };

beforeEach(() => {
  fakeDb.reset({
    categories: [{ id: "electronics", label: "Electronics", icon_key: "Package", sort_order: 0, active: true, created_at: now(), updated_at: now() }],
    platform_fee_config: [{ id: "fee_1", fee_bps: 500, created_at: now() }],
    sellers: [{ id: "seller_1", user_id: "seller_user", name: "Terra Gadgets" }],
    users: [
      { id: "buyer_1", role: "buyer", name: "Ada", notifications_enabled: true },
      { id: "seller_user", role: "seller", name: "Tunde", business_name: "Terra Gadgets", notifications_enabled: true },
    ],
    notifications: [],
  });
});

async function listing(deliveryOption: "Delivery" | "Pickup" | "Both", deliveryFee = 2000) {
  return createProduct({
    category: "electronics",
    name: "Blender",
    price: 10000,
    seller: "Terra Gadgets",
    // No seller_id: skips the store-plan listing cap (not what's under test
    // here); orders then reach the seller by business name.
    sellerId: null,
    condition: "New",
    qty: 10,
    deliveryOption,
    deliveryFee,
  });
}

// The fake has no column defaults: give a new order the 'pending' payment
// status the real table defaults to.
async function newOrder(productId: string, qty = 1) {
  const o = await createOrderFromProduct(productId, qty, "buyer_1");
  await fakeDb.from("orders").update({ payment_status: "pending", escrow_status: "unpaid" }).eq("id", o.id);
  return o;
}

describe("a listing's delivery fee", () => {
  it("is stored with the listing, and is 0 for pickup-only", async () => {
    expect((await listing("Both", 2000)).deliveryFee).toBe(2000);
    expect((await listing("Pickup", 2000)).deliveryFee).toBe(0);
  });

  it("can be edited, and switching to pickup-only clears it", async () => {
    const p = await listing("Delivery", 2000);
    expect((await updateProduct(p.id, { deliveryFee: 3500 }))!.deliveryFee).toBe(3500);
    expect((await updateProduct(p.id, { deliveryOption: "Pickup" }))!.deliveryFee).toBe(0);
  });

  it("refuses a nonsense fee", async () => {
    await expect(listing("Delivery", -5)).rejects.toThrow(/Delivery fee/);
  });
});

describe("choosing delivery at checkout", () => {
  it("starts at the item price, then adds the fee when delivered and saves the address for next time", async () => {
    const p = await listing("Both", 2000);
    const order = await newOrder(p.id, 1);
    expect(order).toMatchObject({ price: 10000, itemPrice: 10000, deliveryFeeQuote: 2000, deliveryMethod: null, deliveryOptions: "Both" });

    const delivered = await setOrderDelivery(order.id, "buyer_1", { method: "delivery", address: ADDRESS });
    expect(delivered).toMatchObject({ price: 12000, itemPrice: 10000, deliveryFee: 2000, deliveryMethod: "delivery" });
    expect(delivered!.deliveryAddress).toMatchObject({ fullName: "Ada Obi", state: "Lagos" });
    expect(fakeDb.dump("users").find((u) => u.id === "buyer_1")!.saved_delivery_address).toMatchObject({ area: "Yaba" });

    const pickedUp = await setOrderDelivery(order.id, "buyer_1", { method: "pickup" });
    expect(pickedUp).toMatchObject({ price: 10000, deliveryFee: 0, deliveryMethod: "pickup", deliveryAddress: null });
  });

  it("charges the delivery fee once per order, not per item", async () => {
    const p = await listing("Delivery", 2000);
    const order = await newOrder(p.id, 3);
    expect((await setOrderDelivery(order.id, "buyer_1", { method: "delivery", address: ADDRESS }))!.price).toBe(32000);
  });

  it("only offers what the seller offers", async () => {
    const pickupOnly = await newOrder((await listing("Pickup")).id, 1);
    await expect(setOrderDelivery(pickupOnly.id, "buyer_1", { method: "delivery", address: ADDRESS })).rejects.toThrow(/only offers pickup/);
    const deliveryOnly = await newOrder((await listing("Delivery")).id, 1);
    await expect(setOrderDelivery(deliveryOnly.id, "buyer_1", { method: "pickup" })).rejects.toThrow(/only offers delivery/);
  });

  it("needs a full address to deliver", async () => {
    const order = await newOrder((await listing("Delivery")).id, 1);
    await expect(setOrderDelivery(order.id, "buyer_1", { method: "delivery", address: { ...ADDRESS, phone: "" } })).rejects.toThrow(/phone/);
    await expect(setOrderDelivery(order.id, "buyer_1", { method: "teleport" })).rejects.toThrow(/delivery or pickup/);
  });

  it("is the buyer's alone", async () => {
    const order = await newOrder((await listing("Both")).id, 1);
    expect(await setOrderDelivery(order.id, "someone_else", { method: "pickup" })).toBeNull();
  });
});

describe("once the buyer starts paying", () => {
  it("fixes the method and price, but still lets them correct the address", async () => {
    const order = await newOrder((await listing("Both", 2000)).id, 1);
    await setOrderDelivery(order.id, "buyer_1", { method: "delivery", address: ADDRESS });
    expect(await lockOrderDelivery(order.id, 12000)).toBe(true);

    await expect(setOrderDelivery(order.id, "buyer_1", { method: "pickup" })).rejects.toThrow(/already started paying/);
    const fixed = await setOrderDelivery(order.id, "buyer_1", { method: "delivery", address: { ...ADDRESS, landmark: "Green gate" } });
    expect(fixed).toMatchObject({ price: 12000, deliveryLocked: true });
    expect(fixed!.deliveryAddress!.landmark).toBe("Green gate");
  });

  it("can't lock at a price the order no longer has, or before a method is chosen", async () => {
    const order = await newOrder((await listing("Both", 2000)).id, 1);
    expect(await lockOrderDelivery(order.id, 10000)).toBe(false); // no method yet
    await setOrderDelivery(order.id, "buyer_1", { method: "delivery", address: ADDRESS });
    expect(await lockOrderDelivery(order.id, 10000)).toBe(false); // the pickup price it was read at
    expect((await getOrder(order.id))!.deliveryLocked).toBe(false);
  });

  it("can't be changed at all once paid", async () => {
    const order = await newOrder((await listing("Both", 2000)).id, 1);
    await setOrderDelivery(order.id, "buyer_1", { method: "pickup" });
    await confirmOrderPayment(order.id);
    await expect(setOrderDelivery(order.id, "buyer_1", { method: "pickup" })).rejects.toThrow(/already paid/);
  });
});

describe("paying for a delivered order", () => {
  it("takes the platform fee on the item only; the seller gets the whole delivery fee", async () => {
    const order = await newOrder((await listing("Delivery", 2000)).id, 1);
    await setOrderDelivery(order.id, "buyer_1", { method: "delivery", address: ADDRESS });
    await confirmOrderPayment(order.id);

    const paid = (await getOrder(order.id))!;
    expect(paid).toMatchObject({ price: 12000, platformFeeAmount: 500, sellerPayoutAmount: 11500 });
    expect(paid.platformFeeAmount! + paid.sellerPayoutAmount!).toBe(paid.price);
  });
});

describe("who sees the delivery address", () => {
  it("the seller only once the order is paid; the buyer always", async () => {
    const order = await newOrder((await listing("Delivery")).id, 1);
    await setOrderDelivery(order.id, "buyer_1", { method: "delivery", address: ADDRESS });

    const sellerView = async () => (await listOrders("seller_user", { name: "Terra Gadgets", id: "seller_1" })).find((o) => o.id === order.id)!;
    expect((await sellerView()).deliveryAddress).toBeNull();
    expect((await listOrders("buyer_1")).find((o) => o.id === order.id)!.deliveryAddress).not.toBeNull();

    await confirmOrderPayment(order.id);
    expect((await sellerView()).deliveryAddress).toMatchObject({ fullName: "Ada Obi", phone: "08031234567" });
  });
});

describe("an accepted offer", () => {
  it("carries the offer's delivery terms onto the order", async () => {
    fakeDb.reset({
      requests: [{ id: "req_1", user_id: "buyer_1", title: "Need a blender", status: "open", created_at: now() }],
      offers: [{ id: "off_1", request_id: "req_1", seller: "Terra Gadgets", seller_id: "seller_1", price: 15000, delivery_option: "Both", delivery_fee: 1500, accepted: false, created_at: now() }],
      orders: [],
      users: [{ id: "buyer_1", role: "buyer", name: "Ada" }],
    });
    const { order } = (await acceptOffer("req_1", "off_1", "buyer_1"))!;
    expect(order).toMatchObject({ price: 15000, deliveryOptions: "Both", deliveryFeeQuote: 1500 });
    expect((await setOrderDelivery(order.id, "buyer_1", { method: "delivery", address: ADDRESS }))!.price).toBe(16500);
  });

  it("lets an older offer (no delivery terms) be delivered or collected at no extra cost", async () => {
    fakeDb.reset({
      requests: [{ id: "req_1", user_id: "buyer_1", title: "Need a blender", status: "open", created_at: now() }],
      offers: [{ id: "off_1", request_id: "req_1", seller: "Terra Gadgets", seller_id: "seller_1", price: 15000, accepted: false, created_at: now() }],
      orders: [],
      users: [{ id: "buyer_1", role: "buyer", name: "Ada" }],
    });
    const { order } = (await acceptOffer("req_1", "off_1", "buyer_1"))!;
    expect((await setOrderDelivery(order.id, "buyer_1", { method: "delivery", address: ADDRESS }))!.price).toBe(15000);
  });
});

describe("delivery pricing choices", () => {
  const LAGOS = { ...ADDRESS, state: "Lagos" };
  const OYO = { ...ADDRESS, state: "Oyo", area: "Bodija" };
  async function priced(deliveryPricing: "free" | "fixed" | "location", fee = 0, rates: Record<string, number> | null = null, name = "Fan") {
    return createProduct({
      category: "electronics", name, price: 10000, seller: "Terra Gadgets", sellerId: null, condition: "New", qty: 10,
      deliveryOption: "Both", deliveryPricing, deliveryFee: fee, deliveryRates: rates,
    });
  }

  it("free shipping: nothing added at checkout", async () => {
    const order = await newOrder((await priced("free")).id);
    expect((await setOrderDelivery(order.id, "buyer_1", { method: "delivery", address: OYO }))!).toMatchObject({ deliveryFee: 0, price: 10000 });
  });

  it("fixed fee: the same everywhere", async () => {
    const order = await newOrder((await priced("fixed", 3000)).id);
    expect((await setOrderDelivery(order.id, "buyer_1", { method: "delivery", address: OYO }))!).toMatchObject({ deliveryFee: 3000, price: 13000 });
  });

  it("by location: the address's state decides", async () => {
    const p = await priced("location", 6000, { Lagos: 2500 });
    expect(p).toMatchObject({ deliveryPricing: "location", deliveryFee: 6000, deliveryRates: { Lagos: 2500 } });
    const order = await newOrder(p.id);
    expect(order).toMatchObject({ deliveryFeeQuote: 6000, deliveryRates: { Lagos: 2500 } });
    expect((await setOrderDelivery(order.id, "buyer_1", { method: "delivery", address: LAGOS }))!).toMatchObject({ deliveryFee: 2500, price: 12500 });
    expect((await setOrderDelivery(order.id, "buyer_1", { method: "delivery", address: OYO }))!).toMatchObject({ deliveryFee: 6000, price: 16000 });
  });

  it("a cart from one seller pays the highest fee for each state, once", async () => {
    const a = await priced("location", 6000, { Lagos: 2500 }, "Fan");
    const b = await priced("fixed", 3000, null, "Kettle");
    const c = await priced("free", 0, null, "Cable");
    const [order] = await createOrdersFromCart([{ productId: a.id, qty: 1 }, { productId: b.id, qty: 1 }, { productId: c.id, qty: 1 }], "buyer_1");
    // Lagos: max(2500, 3000, 0) = 3000; elsewhere: max(6000, 3000, 0) = 6000.
    expect(order).toMatchObject({ deliveryFeeQuote: 6000, deliveryRates: { Lagos: 3000 } });
  });

  it("an older listing with no choice is 'not set', and editing other things doesn't force one", async () => {
    const p = await createProduct({ category: "electronics", name: "Old", price: 1000, seller: "Terra Gadgets", sellerId: null, condition: "New", deliveryOption: "Delivery" });
    expect(p.deliveryPricing).toBeNull();
    expect((await updateProduct(p.id, { price: 1200 }))!.deliveryPricing).toBeNull();
    expect((await updateProduct(p.id, { deliveryPricing: "free" }))!.deliveryPricing).toBe("free");
  });

  it("an order from a listing with no pricing says the fee isn't set (rather than 'free')", async () => {
    const unset = await createProduct({ category: "electronics", name: "Old", price: 1000, seller: "Terra Gadgets", sellerId: null, condition: "New", qty: 5, deliveryOption: "Delivery" });
    expect((await newOrder(unset.id)).deliveryFeeUnset).toBe(true);
    expect((await newOrder((await priced("free")).id)).deliveryFeeUnset).toBe(false);
  });

  it("pickup-only clears delivery pricing", async () => {
    const p = await priced("location", 6000, { Lagos: 2500 });
    expect((await updateProduct(p.id, { deliveryOption: "Pickup" }))!).toMatchObject({ deliveryPricing: null, deliveryRates: null, deliveryFee: 0 });
  });
});

describe("buyer names for the seller", () => {
  it("appear on paid orders only", async () => {
    const order = await newOrder((await listing("Delivery")).id);
    await setOrderDelivery(order.id, "buyer_1", { method: "delivery", address: ADDRESS });
    const sellerView = async () => (await listOrders("seller_user", { name: "Terra Gadgets", id: "seller_1" })).find((o) => o.id === order.id)!;
    expect((await sellerView()).buyerName).toBeNull();
    await confirmOrderPayment(order.id);
    expect((await sellerView()).buyerName).toBe("Ada");
    expect((await listOrders("buyer_1")).find((o) => o.id === order.id)!.buyerName).toBeNull();
  });
});
