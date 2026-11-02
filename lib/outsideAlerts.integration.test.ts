import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";

// Alerts outside the app (lib/outsideAlerts.ts): texts for money events
// through Termii, and push alerts to every browser where alerts are on.

const fakeDb: FakeSupabase = createFakeSupabase();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => fakeDb }));
const { sendSms } = vi.hoisted(() => ({ sendSms: vi.fn(async (_phone: string, _message: string, _channel?: string) => {}) }));
vi.mock("./sms", () => ({ isSmsConfigured: () => true, sendSms }));
const { sendNotification } = vi.hoisted(() => ({ sendNotification: vi.fn(async () => ({})) }));
vi.mock("web-push", () => ({ default: { setVapidDetails: () => {}, sendNotification } }));

process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.VAPID_PUBLIC_KEY = "test-public";
process.env.VAPID_PRIVATE_KEY = "test-private";

const { isValidPushSubscription, savePushSubscription, removePushSubscription, sendPushToUser } = await import("./outsideAlerts");
const { notifyBestEffort, createOrderFromProduct, createProduct, setOrderDelivery } = await import("./repo");
const { confirmOrderPayment } = await import("./payments");

const now = () => new Date().toISOString();
const SUB = { endpoint: "https://push.example/abc", keys: { p256dh: "p".repeat(20), auth: "a".repeat(10) } };

beforeEach(() => {
  sendSms.mockClear();
  sendNotification.mockReset();
  sendNotification.mockResolvedValue({});
  fakeDb.reset({
    users: [
      { id: "buyer_1", role: "buyer", name: "Ada", phone: "+2348031111111", notifications_enabled: true },
      { id: "u_terra", role: "seller", name: "Tunde", business_name: "Terra Gadgets", phone: "+2348032222222", notifications_enabled: true },
      { id: "quiet", role: "buyer", name: "Q", phone: "+2348033333333", notifications_enabled: false },
    ],
    notifications: [],
    push_subscriptions: [],
    categories: [{ id: "electronics", label: "Electronics", icon_key: "Package", sort_order: 0, active: true, created_at: now(), updated_at: now() }],
    platform_fee_config: [{ id: "fee_1", fee_bps: 500, created_at: now() }],
  });
});

describe("text alerts", () => {
  it("go to the person's phone when asked for", async () => {
    await notifyBestEffort({ userId: "buyer_1", type: "delivery", title: "On its way", body: "x", sms: "FindIt: on its way" });
    expect(sendSms).toHaveBeenCalledWith("+2348031111111", "FindIt: on its way", "dnd");
  });

  it("aren't sent for ordinary notifications, or to someone who turned notifications off", async () => {
    await notifyBestEffort({ userId: "buyer_1", type: "offer", title: "New offer", body: "x" });
    await notifyBestEffort({ userId: "quiet", type: "delivery", title: "x", body: "x", sms: "x" });
    expect(sendSms).not.toHaveBeenCalled();
  });

  it("tell the seller about a new paid order, with where it's going", async () => {
    const p = await createProduct({ category: "electronics", name: "Blender", price: 10000, seller: "Terra Gadgets", sellerId: null, condition: "New", qty: 3, deliveryOption: "Both", deliveryFee: 2000 });
    const order = await createOrderFromProduct(p.id, 1, "buyer_1");
    await fakeDb.from("orders").update({ payment_status: "pending", escrow_status: "unpaid" }).eq("id", order.id);
    await setOrderDelivery(order.id, "buyer_1", { method: "delivery", address: { fullName: "Ada Obi", phone: "08031234567", address: "12 Herbert Macaulay Way", area: "Yaba", state: "Lagos", landmark: "" } });
    await confirmOrderPayment(order.id);
    const [phone, text] = sendSms.mock.calls.find((c) => c[0] === "+2348032222222")!;
    expect(phone).toBe("+2348032222222");
    expect(text).toMatch(/New paid order! "Blender" \(₦12,000\)\. Deliver to Yaba, Lagos\./);
  });
});

describe("push alerts", () => {
  it("only accept real subscriptions", () => {
    expect(isValidPushSubscription(SUB)).toBe(true);
    expect(isValidPushSubscription({ endpoint: "http://insecure", keys: SUB.keys })).toBe(false);
    expect(isValidPushSubscription({ endpoint: SUB.endpoint })).toBe(false);
  });

  it("go to every browser where the person turned alerts on, with every notification", async () => {
    await savePushSubscription("buyer_1", SUB);
    await notifyBestEffort({ userId: "buyer_1", type: "offer", title: "New offer", body: "Kemi sent an offer" });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const [sub, payload] = sendNotification.mock.calls[0] as unknown as [{ endpoint: string }, string];
    expect(sub.endpoint).toBe(SUB.endpoint);
    expect(JSON.parse(payload)).toMatchObject({ title: "New offer", body: "Kemi sent an offer", tag: "offer" });
  });

  it("move to whoever signs in on that browser, and stop when turned off", async () => {
    await savePushSubscription("buyer_1", SUB);
    await savePushSubscription("u_terra", SUB);
    expect(fakeDb.dump("push_subscriptions")).toHaveLength(1);
    expect(fakeDb.dump("push_subscriptions")[0].user_id).toBe("u_terra");
    await removePushSubscription("buyer_1", SUB.endpoint); // not theirs any more: no effect
    expect(fakeDb.dump("push_subscriptions")).toHaveLength(1);
    await removePushSubscription("u_terra", SUB.endpoint);
    expect(fakeDb.dump("push_subscriptions")).toHaveLength(0);
  });

  it("forget a browser that has unsubscribed or uninstalled", async () => {
    await savePushSubscription("buyer_1", SUB);
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));
    await sendPushToUser("buyer_1", { title: "x", body: "y" });
    expect(fakeDb.dump("push_subscriptions")).toHaveLength(0);
  });
});
