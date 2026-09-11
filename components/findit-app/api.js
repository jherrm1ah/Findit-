// Routes that legitimately answer 401 to someone who is NOT logged in — a
// wrong password on the login screen is not an expired session, and must not
// bounce anyone anywhere.
const PUBLIC_AUTH_ROUTES = [
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/logout",
  "/api/auth/send-otp",
  "/api/auth/verify-otp",
  "/api/auth/resend-otp",
  "/api/auth/reset-password",
];

// The app shell registers a handler here at startup. Without it, a session
// that expires mid-use turns every tap into a generic error while the person
// keeps staring at stale data, never told they've been signed out.
let sessionExpiredHandler = null;
export function setSessionExpiredHandler(fn) {
  sessionExpiredHandler = fn;
}

async function request(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Request failed: ${res.status}`);
    // Carry through any extra fields a route attaches to an error response
    // (e.g. retryAfter on a 429) so callers can react to them, not just
    // show the message.
    Object.assign(err, body);
    if (res.status === 401 && !PUBLIC_AUTH_ROUTES.some((route) => url.startsWith(route))) {
      err.sessionExpired = true;
      sessionExpiredHandler?.();
    }
    throw err;
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

  getMySellerStatus: () => request("/api/sellers/me").then((d) => d.status),
  getMyStoreBranding: () => request("/api/sellers/me").then((d) => ({ logoUrl: d.logoUrl, bannerUrl: d.bannerUrl })),

  getSavedIds: () => request("/api/saved").then((d) => d.productIds),
  saveItem: (productId) =>
    request("/api/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    }),
  unsaveItem: (productId) => request(`/api/saved/${productId}`, { method: "DELETE" }),

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
  // Buyer-only: this is what marks an order delivered and releases the payment.
  confirmDelivery: (orderId) =>
    request(`/api/orders/${orderId}/confirm`, { method: "POST" }).then((d) => d.order),
  reportOrderIssue: (orderId, note) =>
    request(`/api/orders/${orderId}/issue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    }).then((d) => d.order),

  becomeSeller: (businessName) =>
    request("/api/auth/become-seller", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessName }),
    }).then((d) => d.user),

  getNotifications: () => request("/api/notifications").then((d) => d.notifications),
  markNotificationRead: (id) =>
    request(`/api/notifications/${id}`, { method: "PATCH" }).then((d) => d.notification),
  markAllNotificationsRead: () =>
    request("/api/notifications/read-all", { method: "POST" }).then((d) => d.notifications),

  getSellers: () => request("/api/sellers").then((d) => d.sellers),
  getAdminActions: () => request("/api/admin/actions").then((d) => d.actions),
  getReportedOrders: () => request("/api/admin/disputes").then((d) => d.orders),
  getSellerIdentityReport: () => request("/api/admin/seller-identity"),
  runSellerIdentityBackfill: (apply) =>
    request("/api/admin/seller-identity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apply: Boolean(apply) }),
    }),
  messageBuyerAboutOrder: (orderId) =>
    request(`/api/orders/${orderId}/message`, { method: "POST" }),
  resolveOrderIssue: (orderId, outcome) =>
    request("/api/admin/disputes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, outcome }),
    }).then((d) => d.order),
  getOtpStats: () => request("/api/admin/otp-stats").then((d) => d.stats),
  getSellerVerifications: () => request("/api/admin/seller-verifications").then((d) => d.submissions),
  reviewSellerVerification: (sellerId, action, reason) =>
    request(`/api/admin/seller-verifications/${sellerId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    }),
  lookupUserByPhone: (phone) =>
    request(`/api/admin/users/lookup?phone=${encodeURIComponent(phone)}`).then((d) => d.user),
  promoteToAdmin: (phone) =>
    request("/api/admin/promote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    }).then((d) => d.user),
  demoteFromAdmin: (phone) =>
    request("/api/admin/demote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    }).then((d) => d.user),
  setSellerStatus: (id, status) =>
    request(`/api/sellers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).then((d) => d.seller),

  classifyRequest: (description) =>
    request("/api/ai/classify-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    }).then((d) => d.result),

  getOpenRequests: () => request("/api/requests").then((d) => d.requests),
  getMyRequests: () => request("/api/requests/mine").then((d) => d.requests),
  createRequest: (payload) =>
    request("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((d) => d.request),
  acceptOffer: (requestId, offerId) =>
    request(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acceptOfferId: offerId }),
    }).then((d) => d.order),
  sendSellerOffer: (requestId, payload) =>
    request(`/api/requests/${requestId}/offers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((d) => d.offer),

  updateMyLocation: (lat, lng) =>
    request("/api/me/location", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng }),
    }),

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
  sendOtp: (phone, purpose = "signup") =>
    request("/api/auth/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, purpose }),
    }),
  resendOtp: (phone, purpose = "signup") =>
    request("/api/auth/resend-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, purpose }),
    }),
  verifyOtp: (phone, code, purpose = "signup") =>
    request("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code, purpose }),
    }),
  resetPassword: (phone, newPassword) =>
    request("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, newPassword }),
    }),
  updateName: (name) =>
    request("/api/auth/name", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then((d) => d.user),
  updateBusinessName: (businessName) =>
    request("/api/auth/business-name", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessName }),
    }).then((d) => d.user),
  updatePhone: (newPhone, currentPassword) =>
    request("/api/auth/phone", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPhone, currentPassword }),
    }).then((d) => d.user),
  updatePassword: (currentPassword, newPassword) =>
    request("/api/auth/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  updateAvatar: (avatarUrl) =>
    request("/api/auth/avatar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarUrl }),
    }).then((d) => d.user),
  updateNotificationPref: (enabled) =>
    request("/api/auth/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    }).then((d) => d.user),

  getStorePlans: () => request("/api/subscriptions/plans"),
  getMyStorePlan: () => request("/api/sellers/me/subscription"),
  changeStorePlan: (planId, billingPeriod = "monthly") =>
    request("/api/sellers/me/subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, billingPeriod }),
    }),
  cancelStorePlan: () => request("/api/sellers/me/subscription", { method: "DELETE" }).then((d) => d.subscription),
  getMyVerification: () => request("/api/sellers/me/verification"),
  submitVerification: (fields, photosByKind) => {
    const fd = new FormData();
    fd.append("fields", JSON.stringify(fields));
    for (const [kind, files] of Object.entries(photosByKind || {})) {
      for (const file of files) fd.append(`photo_${kind}`, file);
    }
    return request("/api/sellers/me/verification", { method: "POST", body: fd });
  },
  updateStoreBranding: (logoUrl, bannerUrl) =>
    request("/api/sellers/me/branding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logoUrl, bannerUrl }),
    }),

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
