import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";

// Migration 044 against the fake Supabase client: a cart becomes one order
// per seller, payment takes the order off stock, and unpaid orders can be
// cancelled (by the buyer, or automatically after UNPAID_ORDER_DAYS).

const fakeDb: FakeSupabase = createFakeSupabase();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => fakeDb }));
process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const repo = await import("./repo");
const { createProduct, createOrdersFromCart, createOrderFromProduct, assertOrderInStock, cancelUnpaidOrder, expireUnpaidOrders, acceptOffer, getOrder, getProduct, setOrderDelivery, UNPAID_ORDER_DAYS } = repo;
const { confirmOrderPayment } = await import("./payments");

const now = () => new Date().toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();

beforeEach(() => {
  fakeDb.reset({
    categories: [{ id: "electronics", label: "Electronics", icon_key: "Package", sort_order: 0, active: true, created_at: now(), updated_at: now() }],
    platform_fee_config: [{ id: "fee_1", fee_bps: 500, created_at: now() }],
    users: [
      { id: "buyer_1", role: "buyer", name: "Ada", notifications_enabled: true },
      { id: "u_terra", role: "seller", name: "Tunde", business_name: "Terra Gadgets", notifications_enabled: true },
      { id: "u_kemi", role: "seller", name: "Kemi", business_name: "Kemi's Kitchen", notifications_enabled: true },
    ],
    notifications: [],
    payments: [],
  });
});

async function listing(name: string, opts: { seller?: string; price?: number; qty?: number; deliveryOption?: "Delivery" | "Pickup" | "Both"; deliveryFee?: number } = {}) {
  return createProduct({
    category: "electronics",
    name,
    price: opts.price ?? 10000,
    seller: opts.seller ?? "Terra Gadgets",
    sellerId: null,
    condition: "New",
    qty: opts.qty ?? 5,
    deliveryOption: opts.deliveryOption ?? "Both",
    deliveryFee: opts.deliveryFee ?? 0,
  });
}

// The fake has no column defaults: what the real orders table fills in.
async function asPending(orderId: string) {
  await fakeDb.from("orders").update({ payment_status: "pending", escrow_status: "unpaid" }).eq("id", orderId);
}

describe("checking out a cart", () => {
  it("makes one order per seller, with one delivery fee (the highest), not one per item", async () => {
    const blender = await listing("Blender", { price: 20000, deliveryFee: 2500 });
    const kettle = await listing("Kettle", { price: 8000, deliveryFee: 1500 });
    const pot = await listing("Pot", { seller: "Kemi's Kitchen", price: 5000, deliveryFee: 1000 });

    const orders = await createOrdersFromCart(
      [{ productId: blender.id, qty: 1 }, { productId: kettle.id, qty: 2 }, { productId: pot.id, qty: 1 }],
      "buyer_1"
    );
    expect(orders).toHaveLength(2);
    const terra = orders.find((o) => o.seller === "Terra Gadgets")!;
    expect(terra).toMatchObject({ item: "Blender, Kettle ×2", price: 36000, itemPrice: 36000, deliveryFeeQuote: 2500, deliveryOptions: "Both" });
    expect(terra.lines).toEqual([
      { productId: blender.id, name: "Blender", qty: 1, unitPrice: 20000 },
      { productId: kettle.id, name: "Kettle", qty: 2, unitPrice: 8000 },
    ]);
    expect(orders.find((o) => o.seller === "Kemi's Kitchen")).toMatchObject({ item: "Pot", price: 5000 });
  });

  it("offers only what every item allows", async () => {
    const a = await listing("Lamp", { deliveryOption: "Both", deliveryFee: 1000 });
    const b = await listing("Desk", { deliveryOption: "Delivery", deliveryFee: 4000 });
    const [order] = await createOrdersFromCart([{ productId: a.id, qty: 1 }, { productId: b.id, qty: 1 }], "buyer_1");
    expect(order).toMatchObject({ deliveryOptions: "Delivery", deliveryFeeQuote: 4000 });
  });

  it("splits a seller's items that can't share a delivery choice", async () => {
    const a = await listing("Fridge", { deliveryOption: "Pickup" });
    const b = await listing("Phone", { deliveryOption: "Delivery", deliveryFee: 1000 });
    const orders = await createOrdersFromCart([{ productId: a.id, qty: 1 }, { productId: b.id, qty: 1 }], "buyer_1");
    expect(orders.map((o) => o.deliveryOptions).sort()).toEqual(["Delivery", "Pickup"]);
  });

  it("adds up the same item listed twice", async () => {
    const a = await listing("Cable");
    const [order] = await createOrdersFromCart([{ productId: a.id, qty: 1 }, { productId: a.id, qty: 2 }], "buyer_1");
    expect(order.lines).toEqual([{ productId: a.id, name: "Cable", qty: 3, unitPrice: 10000 }]);
  });

  it("checks everything first: one problem orders nothing", async () => {
    const ok = await listing("Cable");
    const few = await listing("Charger", { qty: 1 });
    await expect(
      createOrdersFromCart([{ productId: ok.id, qty: 1 }, { productId: few.id, qty: 2 }], "buyer_1")
    ).rejects.toThrow("Only 1 of Charger left.");
    expect(fakeDb.dump("orders")).toHaveLength(0);
  });

  it("refuses an empty cart", async () => {
    await expect(createOrdersFromCart([], "buyer_1")).rejects.toThrow(/empty/);
  });
});

describe("stock", () => {
  it("won't take an order for more than there is", async () => {
    const p = await listing("Blender", { qty: 2 });
    await expect(createOrderFromProduct(p.id, 3, "buyer_1")).rejects.toThrow("Only 2 of Blender left.");
  });

  it("goes down once when the order is paid, even if the payment is confirmed twice", async () => {
    const p = await listing("Blender", { qty: 5 });
    const order = await createOrderFromProduct(p.id, 2, "buyer_1");
    await asPending(order.id);
    await setOrderDelivery(order.id, "buyer_1", { method: "pickup" });
    await confirmOrderPayment(order.id);
    await confirmOrderPayment(order.id);
    expect((await getProduct(p.id))!.qty).toBe(3);
  });

  it("tells the seller when a listing sells out, and never goes below 0", async () => {
    const p = await listing("Blender", { qty: 1 });
    const first = await createOrderFromProduct(p.id, 1, "buyer_1");
    const second = await createOrderFromProduct(p.id, 1, "buyer_1"); // both before either paid
    for (const o of [first, second]) {
      await asPending(o.id);
      await confirmOrderPayment(o.id);
    }
    expect((await getProduct(p.id))!.qty).toBe(0);
    expect(fakeDb.dump("notifications").filter((n) => n.user_id === "u_terra" && n.title === "Sold out")).toHaveLength(1);
  });

  it("is checked again before paying", async () => {
    const p = await listing("Blender", { qty: 1 });
    const mine = await createOrderFromProduct(p.id, 1, "buyer_1");
    const theirs = await createOrderFromProduct(p.id, 1, "buyer_1");
    await asPending(theirs.id);
    await confirmOrderPayment(theirs.id);
    await expect(assertOrderInStock(mine)).rejects.toThrow(/sold out/);
  });
});

describe("cancelling an unpaid order", () => {
  it("cancels it, once", async () => {
    const order = await createOrderFromProduct((await listing("Blender")).id, 1, "buyer_1");
    await asPending(order.id);
    expect(await cancelUnpaidOrder(order.id, "buyer")).toMatchObject({ status: "Cancelled", cancelReason: "buyer" });
    expect(await cancelUnpaidOrder(order.id, "buyer")).toBeNull();
  });

  it("never cancels a paid order", async () => {
    const order = await createOrderFromProduct((await listing("Blender")).id, 1, "buyer_1");
    await asPending(order.id);
    await confirmOrderPayment(order.id);
    expect(await cancelUnpaidOrder(order.id, "buyer")).toBeNull();
    expect((await getOrder(order.id))!.paymentStatus).toBe("paid");
  });

  it("goes ahead after all if an old checkout link gets paid", async () => {
    const order = await createOrderFromProduct((await listing("Blender")).id, 1, "buyer_1");
    await asPending(order.id);
    await cancelUnpaidOrder(order.id, "buyer");
    await confirmOrderPayment(order.id);
    expect(await getOrder(order.id)).toMatchObject({ paymentStatus: "paid", status: "Awaiting payment", cancelledAt: null });
  });

  it("puts an accepted offer's request back up and tells that seller", async () => {
    fakeDb.reset({
      requests: [{ id: "req_1", user_id: "buyer_1", title: "Need a blender", status: "open", created_at: now() }],
      offers: [{ id: "off_1", request_id: "req_1", seller: "Kemi's Kitchen", seller_id: null, price: 15000, accepted: false, created_at: now() }],
      orders: [],
      users: [{ id: "buyer_1", role: "buyer", name: "Ada" }, { id: "u_kemi", role: "seller", business_name: "Kemi's Kitchen", notifications_enabled: true }],
      notifications: [],
    });
    const { order } = (await acceptOffer("req_1", "off_1", "buyer_1"))!;
    await cancelUnpaidOrder(order.id, "buyer");
    expect(fakeDb.dump("requests")[0].status).toBe("open");
    expect(fakeDb.dump("offers")[0].accepted).toBe(false);
    expect(fakeDb.dump("notifications").some((n) => n.user_id === "u_kemi" && n.title === "Order cancelled")).toBe(true);
  });
});

describe(`closing orders left unpaid for ${UNPAID_ORDER_DAYS} days`, () => {
  it("closes old unpaid orders and tells the buyer; leaves new, paid and in-progress ones", async () => {
    const p = await listing("Blender");
    const old = await createOrderFromProduct(p.id, 1, "buyer_1");
    const fresh = await createOrderFromProduct(p.id, 1, "buyer_1");
    const paying = await createOrderFromProduct(p.id, 1, "buyer_1");
    const paid = await createOrderFromProduct(p.id, 1, "buyer_1");
    for (const o of [old, fresh, paying, paid]) await asPending(o.id);
    for (const o of [old, paying, paid]) await fakeDb.from("orders").update({ created_at: daysAgo(UNPAID_ORDER_DAYS + 1) }).eq("id", o.id);
    await confirmOrderPayment(paid.id);
    await fakeDb.from("payments").insert({ id: "pay_1", order_id: paying.id, kind: "order", status: "pending", amount: 10000, created_at: now() });

    expect(await expireUnpaidOrders()).toBe(1);
    expect((await getOrder(old.id))!).toMatchObject({ status: "Cancelled", cancelReason: "expired" });
    for (const o of [fresh, paying]) expect((await getOrder(o.id))!.status).toBe("Awaiting payment");
    expect((await getOrder(paid.id))!.paymentStatus).toBe("paid");
    expect(fakeDb.dump("notifications").some((n) => n.user_id === "buyer_1" && n.title === "Unpaid order closed")).toBe(true);
  });
});
