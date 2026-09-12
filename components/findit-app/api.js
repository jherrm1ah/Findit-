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

// The server's answer when the caller is a real admin on a valid session but
// hasn't signed in on the staff screen, or their unlock has aged out. Kept in
// sync with ADMIN_UNLOCK_REQUIRED in lib/adminRoles.ts.
export const ADMIN_UNLOCK_REQUIRED = "admin_unlock_required";

// Same idea as the session-expired handler above, for the admin step-up: any
// admin call can come back needing a fresh staff sign-in, and every one of
// them should land on the same screen rather than each caller inventing its
// own error message.
let adminLockedHandler = null;
export function setAdminLockedHandler(fn) {
  adminLockedHandler = fn;
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
    // A missing admin unlock is NOT an expired session — the person stays
    // logged in as themselves and only needs to sign in on the staff screen,
    // so this never goes near the session-expired path above.
    if (body.code === ADMIN_UNLOCK_REQUIRED) {
      err.adminLocked = true;
      adminLockedHandler?.();
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
  payForOrder: (orderId) => request(`/api/orders/${orderId}/pay`, { method: "POST" }),
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

  // A seller's PUBLIC storefront. No session needed — a logged-out visitor
  // can read this. Takes a seller id (correct, unambiguous) or a business
  // name (legacy listings with no seller_id yet); the server answers 409 if
  // a name maps to two accounts rather than guessing which store to show.
  getSellerProfile: (idOrName) =>
    request(`/api/sellers/${encodeURIComponent(idOrName)}`).then((d) => d.seller),
  // Staff sign-in. Being logged in as an admin isn't enough to reach any of
  // the admin calls below — the server requires a per-session unlock that
  // ages out, and answers ADMIN_UNLOCK_REQUIRED until it's granted.
  getAdminSession: () => request("/api/admin/session"),
  startAdminSession: (phone, password) =>
    request("/api/admin/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password }),
    }),
  endAdminSession: () => request("/api/admin/session", { method: "DELETE" }),

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
  getAdminOverview: () => request("/api/admin/overview").then((d) => d.overview),
  getFeeConfig: () => request("/api/admin/fee-config"),
  setFeeConfig: (feeBps) =>
    request("/api/admin/fee-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feeBps }),
    }),
  getPayouts: (status) => request(`/api/admin/payouts${status ? `?status=${status}` : ""}`).then((d) => d.payouts),
  markPayoutPaid: (id) => request(`/api/admin/payouts/${id}`, { method: "PATCH" }),
  getBoostPlans: () => request("/api/boost-plans").then((d) => d.plans),
  boostProduct: (productId, boostPlanId) =>
    request(`/api/products/${productId}/boost`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boostPlanId }),
    }),
  getAdminBoostPlans: () => request("/api/admin/boost-plans").then((d) => d.plans),
  updateAdminBoostPlan: (id, patch) =>
    request(`/api/admin/boost-plans/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then((d) => d.plan),
  getRiskSignals: () => request("/api/admin/risk-signals").then((d) => d.signals),
  getMyTickets: () => request("/api/support/tickets").then((d) => d.tickets),
  createTicket: (subject, body) =>
    request("/api/support/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body }),
    }).then((d) => d.ticket),
  getTicket: (id) => request(`/api/support/tickets/${id}`),
  sendTicketMessage: (id, body) =>
    request(`/api/support/tickets/${id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    }).then((d) => d.message),
  getAdminTickets: (status) => request(`/api/admin/support/tickets${status ? `?status=${status}` : ""}`).then((d) => d.tickets),
  getAdminTicket: (id) => request(`/api/admin/support/tickets/${id}`),
  sendAdminTicketMessage: (id, body) =>
    request(`/api/admin/support/tickets/${id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    }).then((d) => d.message),
  resolveTicket: (id) =>
    request(`/api/admin/support/tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    }).then((d) => d.ticket),
  getAdminAnalytics: (days) => request(`/api/admin/analytics${days ? `?days=${days}` : ""}`).then((d) => d.analytics),
  getAdminAlerts: () => request("/api/admin/alerts").then((d) => d.alerts),
  sendAdminBroadcast: (title, body, audience) =>
    request("/api/admin/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, audience }),
    }).then((d) => d.result),
  getCategories: () => request("/api/categories").then((d) => d.categories),
  getAdminCategories: () => request("/api/admin/categories").then((d) => d.categories),
  createCategory: (label, iconKey, sortOrder) =>
    request("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, iconKey, sortOrder }),
    }).then((d) => d.category),
  updateCategory: (id, patch) =>
    request(`/api/admin/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then((d) => d.category),
  getAdminSubscriptionPlans: () => request("/api/admin/subscription-plans").then((d) => d.plans),
  updateSubscriptionPlan: (id, patch) =>
    request(`/api/admin/subscription-plans/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then((d) => d.plan),
  getTransactions: ({ kind, page } = {}) => {
    const params = new URLSearchParams();
    if (kind) params.set("kind", kind);
    if (page) params.set("page", String(page));
    const qs = params.toString();
    return request(`/api/admin/transactions${qs ? `?${qs}` : ""}`);
  },
  getSellerVerifications: () => request("/api/admin/seller-verifications").then((d) => d.submissions),
  reviewSellerVerification: (sellerId, action, reason) =>
    request(`/api/admin/seller-verifications/${sellerId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    }),
  lookupUserByPhone: (phone) =>
    request(`/api/admin/users/lookup?phone=${encodeURIComponent(phone)}`).then((d) => d.user),
  getAdminUsers: ({ role, search, page } = {}) => {
    const params = new URLSearchParams();
    if (role) params.set("role", role);
    if (search) params.set("search", search);
    if (page) params.set("page", String(page));
    const qs = params.toString();
    return request(`/api/admin/users${qs ? `?${qs}` : ""}`);
  },
  setUserSuspended: (id, suspended, reason) =>
    request(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suspended, reason }),
    }).then((d) => d.user),
  promoteToAdmin: (phone, adminRole) =>
    request("/api/admin/promote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, adminRole }),
    }).then((d) => d.user),
  demoteFromAdmin: (phone) =>
    request("/api/admin/demote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    }).then((d) => d.user),
  setSellerStatus: (id, status, reason) =>
    request(`/api/sellers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reason }),
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
  // The seller's own dedicated storefront: its slug, its public URL, and
  // whether their current plan actually publishes it.
  getMyStore: () => request("/api/sellers/me/store").then((d) => d.store),
  // Idempotent server-side — a repeat returns the existing link rather than
  // creating a second one.
  claimMyStore: () => request("/api/sellers/me/store", { method: "POST" }),

  getMyStorePlan: () => request("/api/sellers/me/subscription"),
  changeStorePlan: (planId, billingPeriod = "monthly") =>
    request("/api/sellers/me/subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, billingPeriod }),
    }),
  cancelStorePlan: () => request("/api/sellers/me/subscription", { method: "DELETE" }).then((d) => d.subscription),
  getFindItPro: () => request("/api/me/subscription"),
  subscribeFindItPro: (planId, billingPeriod = "monthly") =>
    request("/api/me/subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, billingPeriod }),
    }),
  cancelFindItPro: () => request("/api/me/subscription", { method: "DELETE" }).then((d) => d.subscription),
  getBanks: () => request("/api/payments/banks"),
  getPayoutAccount: () => request("/api/sellers/me/payout-account"),
  setPayoutAccount: (accountNumber, bankCode) =>
    request("/api/sellers/me/payout-account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountNumber, bankCode }),
    }),
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
