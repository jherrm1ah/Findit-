import { describe, it, expect } from "vitest";
import { createUser } from "./auth";
import {
  createOrder,
  listOrders,
  updateOrderStatus,
  ORDER_STATUSES,
  createRequestWithAutoOffers,
  addSellerOfferToRequest,
  acceptOffer,
  listOffersForRequest,
  createProduct,
  updateProduct,
  deleteProduct,
  getOrCreateConversation,
  listConversations,
  listMessages,
  sendMessage,
  findUserByBusinessName,
} from "./repo";

let seq = 0;
function uniquePhone() {
  seq += 1;
  return `0804${String(2000000 + seq).padStart(7, "0")}`;
}

describe("orders: creation and scoping", () => {
  it("scopes a user's orders to their own rows plus the shared demo rows", () => {
    const buyer = createUser({
      phone: uniquePhone(),
      password: "pw12345",
      name: "Order Buyer",
      role: "buyer",
      businessName: null,
    });
    const order = createOrder({
      item: "Test Item",
      seller: "Some Seller",
      price: 1000,
      status: "Awaiting payment",
      userId: buyer.id,
    });

    const mine = listOrders(buyer.id);
    expect(mine.some((o) => o.id === order.id)).toBe(true);

    const otherBuyer = createUser({
      phone: uniquePhone(),
      password: "pw12345",
      name: "Other Buyer",
      role: "buyer",
      businessName: null,
    });
    const othersView = listOrders(otherBuyer.id);
    expect(othersView.some((o) => o.id === order.id)).toBe(false);
  });

  it("surfaces orders under a seller's business name even without owning the row", () => {
    const businessName = "Repo Test Sellers " + uniquePhone();
    const order = createOrder({
      item: "Widget",
      seller: businessName,
      price: 2000,
      status: "Awaiting payment",
    });
    const sellerView = listOrders(null, businessName);
    expect(sellerView.some((o) => o.id === order.id)).toBe(true);
  });
});

describe("order status progression", () => {
  it("moves forward through the lifecycle and marks Delivered as reviewable", () => {
    const order = createOrder({
      item: "Progression Item",
      seller: "Progression Seller",
      price: 500,
      status: ORDER_STATUSES[0],
    });
    expect(order.canReview).toBe(false);

    const advanced = updateOrderStatus(order.id, "Seller preparing");
    expect(advanced?.status).toBe("Seller preparing");

    const delivered = updateOrderStatus(order.id, "Delivered");
    expect(delivered?.status).toBe("Delivered");
    expect(delivered?.canReview).toBe(true);
  });

  it("refuses to move an order backwards", () => {
    const order = createOrder({
      item: "Backwards Item",
      seller: "Progression Seller",
      price: 500,
      status: "Dispatched",
    });
    expect(() => updateOrderStatus(order.id, "Seller preparing")).toThrow();
  });

  it("rejects an unknown status", () => {
    const order = createOrder({
      item: "Bad Status Item",
      seller: "Progression Seller",
      price: 500,
      status: "Awaiting payment",
    });
    expect(() => updateOrderStatus(order.id, "Cancelled")).toThrow();
  });
});

describe("request -> offer -> accept flow", () => {
  it("auto-generates offers for a new request, and accepting one creates an order", () => {
    const { request, offers } = createRequestWithAutoOffers({
      title: "Test request " + uniquePhone(),
      description: null,
      budgetMin: 1000,
      budgetMax: 2000,
      qty: 1,
      location: "Jos",
      condition: "New",
      customer: "Test Customer",
    });
    expect(offers.length).toBeGreaterThan(0);

    const sellerOffer = addSellerOfferToRequest(request.id, "Manual Test Seller");
    expect(sellerOffer).not.toBeNull();

    const allOffers = listOffersForRequest(request.id);
    expect(allOffers.length).toBe(offers.length + 1);

    const buyer = createUser({
      phone: uniquePhone(),
      password: "pw12345",
      name: "Accepting Buyer",
      role: "buyer",
      businessName: null,
    });
    const result = acceptOffer(request.id, sellerOffer!.id, buyer.id);
    expect(result?.order.seller).toBe("Manual Test Seller");
    expect(result?.order.status).toBe("Seller preparing");

    const mine = listOrders(buyer.id);
    expect(mine.some((o) => o.id === result?.order.id)).toBe(true);
  });
});

describe("product listing validation", () => {
  it("rejects an unknown category, empty name, and non-positive price", () => {
    expect(() =>
      createProduct({ category: "not-a-real-category", name: "X", price: 100, seller: "S" })
    ).toThrow();
    expect(() =>
      createProduct({ category: "reading", name: "  ", price: 100, seller: "S" })
    ).toThrow();
    expect(() =>
      createProduct({ category: "reading", name: "X", price: 0, seller: "S" })
    ).toThrow();
  });

  it("creates, updates, and deletes a listing", () => {
    const product = createProduct({
      category: "reading",
      name: "Repo Test Product",
      price: 3000,
      seller: "Repo Test Seller",
    });
    expect(product.name).toBe("Repo Test Product");

    const updated = updateProduct(product.id, { price: 3500 });
    expect(updated?.price).toBe(3500);

    expect(deleteProduct(product.id)).toBe(true);
    expect(deleteProduct(product.id)).toBe(false);
  });
});

describe("messaging", () => {
  it("dedupes conversations for the same buyer/seller pair and refuses self-conversations", () => {
    const buyer = createUser({
      phone: uniquePhone(),
      password: "pw12345",
      name: "Msg Buyer",
      role: "buyer",
      businessName: null,
    });
    const seller = createUser({
      phone: uniquePhone(),
      password: "pw12345",
      name: "Msg Seller",
      role: "seller",
      businessName: "Msg Business " + uniquePhone(),
    });

    const id1 = getOrCreateConversation(buyer.id, seller.id);
    const id2 = getOrCreateConversation(buyer.id, seller.id);
    expect(id1).toBe(id2);

    expect(() => getOrCreateConversation(buyer.id, buyer.id)).toThrow();

    expect(findUserByBusinessName(seller.businessName!)?.id).toBe(seller.id);
  });

  it("sends messages, marks them read on fetch, and rejects an empty body", () => {
    const buyer = createUser({
      phone: uniquePhone(),
      password: "pw12345",
      name: "Msg Buyer 2",
      role: "buyer",
      businessName: null,
    });
    const seller = createUser({
      phone: uniquePhone(),
      password: "pw12345",
      name: "Msg Seller 2",
      role: "seller",
      businessName: "Msg Business 2 " + uniquePhone(),
    });
    const conversationId = getOrCreateConversation(buyer.id, seller.id);

    sendMessage(conversationId, buyer.id, "Hello there");
    expect(() => sendMessage(conversationId, buyer.id, "   ")).toThrow();

    const sellerUnreadBefore = listConversations(seller.id).find((c) => c.id === conversationId);
    expect(sellerUnreadBefore?.unreadCount).toBe(1);

    const messages = listMessages(conversationId, seller.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].mine).toBe(false);

    const sellerUnreadAfter = listConversations(seller.id).find((c) => c.id === conversationId);
    expect(sellerUnreadAfter?.unreadCount).toBe(0);
  });
});
