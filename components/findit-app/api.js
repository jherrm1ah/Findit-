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
};
