async function request(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  getProducts: () => request("/api/products").then((d) => d.products),
  createProduct: (payload) =>
    request("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((d) => d.product),
  updateProduct: (id, payload) =>
    request(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((d) => d.product),
  deleteProduct: (id) => request(`/api/products/${id}`, { method: "DELETE" }),
  uploadImage: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return request("/api/uploads", { method: "POST", body: fd }).then((d) => d.url);
  },

  getOrders: () => request("/api/orders").then((d) => d.orders),
  createOrder: (payload) =>
    request("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((d) => d.order),
  submitOrderReview: (orderId, payload) =>
    request(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((d) => d.order),
  updateOrderStatus: (orderId, status) =>
    request(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).then((d) => d.order),

  getNotifications: () => request("/api/notifications").then((d) => d.notifications),
  markNotificationRead: (id) =>
    request(`/api/notifications/${id}`, { method: "PATCH" }).then((d) => d.notification),
  markAllNotificationsRead: () =>
    request("/api/notifications/read-all", { method: "POST" }).then((d) => d.notifications),

  getSellers: () => request("/api/sellers").then((d) => d.sellers),
  setSellerStatus: (id, status) =>
    request(`/api/sellers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).then((d) => d.seller),

  getOpenRequests: () => request("/api/requests").then((d) => d.requests),
  createRequest: (payload) =>
    request("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  acceptOffer: (requestId, offerId) =>
    request(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acceptOfferId: offerId }),
    }).then((d) => d.order),
  sendSellerOffer: (requestId) =>
    request(`/api/requests/${requestId}/offers`, { method: "POST" }).then((d) => d.offer),

  me: () => request("/api/auth/me").then((d) => d.user),
  signup: (payload) =>
    request("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((d) => d.user),
  login: (payload) =>
    request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((d) => d.user),
  logout: () => request("/api/auth/logout", { method: "POST" }),

  getConversations: () => request("/api/messages").then((d) => d.conversations),
  startConversation: (sellerBusinessName) =>
    request("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sellerBusinessName }),
    }).then((d) => d.conversationId),
  getMessages: (conversationId) =>
    request(`/api/messages/${conversationId}`).then((d) => d.messages),
  sendMessage: (conversationId, body) =>
    request(`/api/messages/${conversationId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    }).then((d) => d.message),
};
