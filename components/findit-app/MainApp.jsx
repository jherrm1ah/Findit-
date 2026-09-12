"use client";

import { useEffect, useRef, useState } from "react";
import {
  Home as HomeIcon, Search, ShoppingCart, LayoutDashboard, ShieldCheck, User, ChevronLeft,
} from "lucide-react";
import { Logo, Wordmark, RoleGate, IconButton } from "./shared";
import { api } from "./api";
import { getStoredLocation, requestBrowserLocation } from "./location";
import { applyCategoryOverrides } from "./data";
import Home from "./Home";
import Browse from "./Browse";
import RequestForm from "./RequestForm";
import SellerDashboard from "./SellerDashboard";
import StorePlans from "./StorePlans";
import FindItPro from "./FindItPro";
import SellerOnboarding from "./SellerOnboarding";
import AdminQueue from "./AdminQueue";
import BecomeSeller from "./BecomeSeller";
import Profile from "./Profile";
import AccountDetails from "./AccountDetails";
import NotificationPreferences from "./NotificationPreferences";
import HelpSupport from "./HelpSupport";
import About from "./About";
import Account from "./Account";
import Notifications from "./Notifications";
import Checkout from "./Checkout";
import ProductDetail from "./ProductDetail";
import Messages from "./Messages";
import Thread from "./Thread";
import SellerProfile from "./SellerProfile";
import MyRequests from "./MyRequests";

function tabsFor(role) {
  const middle =
    role === "admin"
      ? { key: "admin", label: "Admin", icon: ShieldCheck }
      : { key: "seller", label: role === "seller" ? "Dashboard" : "Sell", icon: LayoutDashboard };
  return [
    { key: "home", label: "Home", icon: HomeIcon },
    { key: "browse", label: "Search", icon: Search },
    { key: "request", label: "Request", icon: ShoppingCart },
    middle,
    { key: "profile", label: "Profile", icon: User },
  ];
}

export default function MainApp({ user, onLogout, showToast, onUserUpdate }) {
  const isSeller = user?.role === "seller";
  const isAdmin = user?.role === "admin";
  const TABS = tabsFor(user?.role);

  const [screen, setScreen] = useState("home");
  const [browseGroup, setBrowseGroup] = useState("all");
  const [product, setProduct] = useState(null);
  const [viewedSeller, setViewedSeller] = useState(null);
  const [checkoutOrder, setCheckoutOrder] = useState(null);

  const [loaded, setLoaded] = useState(false);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeThread, setActiveThread] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);
  // Real in-app support tickets (lib/support.ts) — see HelpSupport.jsx.
  // Reuses <Thread> for the ticket conversation itself: a ticket message's
  // `isAdmin` maps to the same `mine` field Thread already renders around.
  const [tickets, setTickets] = useState([]);
  const [activeTicket, setActiveTicket] = useState(null);
  const [ticketMessages, setTicketMessages] = useState([]);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [savedIds, setSavedIds] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [adminActions, setAdminActions] = useState([]);
  const [otpStats, setOtpStats] = useState(null);
  const [adminOverview, setAdminOverview] = useState(null);
  const [reportedOrders, setReportedOrders] = useState([]);
  const [sellerVerifications, setSellerVerifications] = useState([]);
  const [mySellerStatus, setMySellerStatus] = useState(null); // pending | approved | rejected | null
  // { subscription, plan, usage: { activeProducts, label }, plans } | null —
  // see GET /api/sellers/me/subscription. null until the first fetch, or
  // permanently for any account that's never been a seller.
  const [storePlan, setStorePlan] = useState(null);
  const [changingPlan, setChangingPlan] = useState(false);
  // { subscription, plan, plans } | null — see GET /api/me/subscription.
  // Account-wide (buyer or seller), unlike storePlan above which only
  // exists for sellers.
  const [findItPro, setFindItPro] = useState(null);
  const [changingFindItPro, setChangingFindItPro] = useState(false);
  // { logoUrl, bannerUrl } | null — real backing for the plan's
  // "customization" benefit; see PATCH /api/sellers/me/branding.
  const [storeBranding, setStoreBranding] = useState(null);
  const [savingBranding, setSavingBranding] = useState(false);
  // { status, rejectionReason, ... } | null — see GET /api/sellers/me/verification.
  // Drives the dashboard's "Complete verification" prompt; the wizard
  // itself (SellerOnboarding.jsx) fetches its own full copy when opened.
  const [verification, setVerification] = useState(null);
  // { hasAccount, bankAccountName, maskedAccountNumber } | null — real
  // payout destination; see GET /api/sellers/me/payout-account. Without
  // this on file, a delivered order's payout is recorded as
  // 'manual_required' rather than actually paid out.
  const [payoutAccount, setPayoutAccount] = useState(null);
  const [banks, setBanks] = useState([]);
  const [savingPayoutAccount, setSavingPayoutAccount] = useState(false);
  // Real, admin-editable boost pricing (lib/boosts.ts) — see
  // GET /api/boost-plans.
  const [boostPlans, setBoostPlans] = useState([]);

  // Real device/account location — set only once the user explicitly grants
  // browser geolocation permission (see ./location.js). Never defaulted to
  // any city. Used to sort listings/requests by real distance; the app
  // falls back to today's recency order whenever this is null.
  const [myLocation, setMyLocation] = useState(null); // { lat, lng } | null
  const [locationStatus, setLocationStatus] = useState("idle"); // idle | requesting | granted | denied | unavailable | unsupported

  useEffect(() => {
    if (user?.lat != null && user?.lng != null) {
      setMyLocation({ lat: user.lat, lng: user.lng });
      setLocationStatus("granted");
      return;
    }
    const stored = getStoredLocation();
    if (stored) {
      setMyLocation({ lat: stored.lat, lng: stored.lng });
      setLocationStatus("granted");
    }
  }, [user?.id]);

  const handleEnableLocation = async () => {
    setLocationStatus("requesting");
    try {
      const loc = await requestBrowserLocation();
      setMyLocation(loc);
      setLocationStatus("granted");
      if (user) {
        api.updateMyLocation(loc.lat, loc.lng).catch(() => {});
      }
    } catch (err) {
      const reason = ["denied", "unsupported"].includes(err.message) ? err.message : "unavailable";
      setLocationStatus(reason);
      showToast(
        reason === "denied"
          ? "Location access was denied — you can still browse everything, just not sorted by distance."
          : "Couldn't get your location right now — try again later.",
        "error"
      );
    }
  };

  useEffect(() => {
    // Real, admin-editable categories (lib/categoryCatalog.ts) — fetched
    // once here (works for a signed-out guest browsing Home too) and
    // applied on top of the static default GROUPS already has, so an
    // admin's rename/deactivate shows up without a deploy. See
    // applyCategoryOverrides in ./data for why this isn't setState.
    api.getCategories().then(applyCategoryOverrides).catch(() => {});

    const tasks = [api.getProducts(), api.getOrders(), api.getNotifications()];
    Promise.all(tasks)
      .then(([p, o, n]) => {
        setProducts(p);
        setOrders(o);
        setNotifications(n);
      })
      .finally(() => setLoaded(true));

    // These two are role-gated server-side; only fetch them for roles that
    // can actually see the screens they back, so a buyer/guest doesn't spend
    // a request hitting a 403 it can't do anything with.
    if (isSeller || isAdmin) {
      api.getOpenRequests().then(setRequests).catch(() => {});
    }
    if (isSeller) {
      api.getMySellerStatus().then(setMySellerStatus).catch(() => {});
      api.getMyStorePlan().then(setStorePlan).catch(() => {});
      api.getMyStoreBranding().then(setStoreBranding).catch(() => {});
      api.getMyVerification().then(setVerification).catch(() => {});
      api.getPayoutAccount().then(setPayoutAccount).catch(() => {});
      api.getBoostPlans().then(setBoostPlans).catch(() => {});
      api.getBanks().then((r) => setBanks(r.banks || [])).catch(() => {});
    }
    if (isAdmin) {
      api.getSellers().then(setSellers).catch(() => {});
      api.getAdminActions().then(setAdminActions).catch(() => {});
      api.getOtpStats().then(setOtpStats).catch(() => {});
      api.getReportedOrders().then(setReportedOrders).catch(() => {});
      api.getSellerVerifications().then(setSellerVerifications).catch(() => {});
      api.getAdminOverview().then(setAdminOverview).catch(() => {});
    }
    if (user) {
      api.getFindItPro().then(setFindItPro).catch(() => {});
      api.getSavedIds().then(setSavedIds).catch(() => {});
      // Fetched here too (not just on navigating to the Messages screen) so
      // Profile's "Messages" card can show an unread count up front, the
      // same way its "Notifications" card already does — otherwise you'd
      // have to open Messages blind to find out you have unread chats.
      api.getConversations().then(setConversations).catch(() => {});
      api.getMyTickets().then(setTickets).catch(() => {});
    } else {
      setSavedIds([]);
    }
  }, [user?.id]);

  // Real back-navigation, not just "tap the logo to jump to Home": every
  // screen the user actually visited gets pushed here, so the header's back
  // arrow returns to wherever they came from — Profile -> Account details ->
  // back goes to Profile, not all the way to Home. Capped defensively so a
  // very long session doesn't grow this without bound.
  const historyRef = useRef([]);
  const MAX_HISTORY = 30;

  // The actual screen switch + its side effects — shared by both forward
  // navigation (go) and back navigation (goBack), but only `go` touches the
  // history stack. If goBack() called `go()` here instead, going back would
  // re-push the screen just left, and a second "back" tap would bounce you
  // right back to it instead of continuing further back.
  const navigateTo = (s, group) => {
    setScreen(s);
    if (s === "browse") setBrowseGroup(group || "all"); // always reset unless a category was explicitly passed
    setProduct(null); // close any open product detail overlay when navigating
    setViewedSeller(null);
    window.scrollTo?.(0, 0);
    if ((s === "seller" || s === "admin") && (isSeller || isAdmin)) {
      api.getOpenRequests().then(setRequests).catch(() => {});
    }
    if (s === "profile" && isSeller) {
      api.getMySellerStatus().then(setMySellerStatus).catch(() => {});
    }
    if ((s === "seller" || s === "storePlans") && isSeller) {
      api.getMyStorePlan().then(setStorePlan).catch(() => {});
    }
    if (s === "findItPro" && user) {
      api.getFindItPro().then(setFindItPro).catch(() => {});
    }
    if ((s === "seller" || s === "sellerOnboarding") && isSeller) {
      api.getMyVerification().then(setVerification).catch(() => {});
    }
    if (s === "messages" && user) {
      api.getConversations().then(setConversations).catch(() => {});
    }
    if (s === "myRequests" && user) {
      api.getMyRequests().then(setMyRequests).catch(() => {});
    }
  };

  const go = (s, group) => {
    if (s !== screen) {
      historyRef.current.push(screen);
      if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
    }
    navigateTo(s, group);
  };

  const goBack = () => {
    const previous = historyRef.current.pop();
    navigateTo(previous || "home");
  };

  const handleToggleSaved = async (productId) => {
    if (!user) {
      showToast("Log in to save items.", "error");
      return;
    }
    const wasSaved = savedIds.includes(productId);
    setSavedIds((ids) => (wasSaved ? ids.filter((id) => id !== productId) : [...ids, productId]));
    try {
      if (wasSaved) {
        await api.unsaveItem(productId);
      } else {
        await api.saveItem(productId);
      }
    } catch (err) {
      setSavedIds((ids) => (wasSaved ? [...ids, productId] : ids.filter((id) => id !== productId)));
      showToast(err.message || "Couldn't update your saved items — try again.", "error");
    }
  };

  const handleViewSeller = (sellerName) => {
    setProduct(null);
    setViewedSeller(sellerName);
  };

  const handleOpenProductFromSeller = (p) => {
    setViewedSeller(null);
    setProduct(p);
  };

  const buyNow = async (prod, qty, condition) => {
    try {
      // Only productId/qty go to the server — it looks up the real product
      // and computes price/seller itself, so nothing here is trusted as-is.
      const order = await api.createOrder({ productId: prod.id, qty });
      setOrders((os) => [order, ...os]);
      setCheckoutOrder({ order, product: prod, qty, condition });
      go("checkout");
    } catch (err) {
      showToast(err.message || "Couldn't place that order — try again.", "error");
    }
  };

  const handleReview = async (orderId, rating, comment) => {
    try {
      const order = await api.submitOrderReview(orderId, { rating, comment: comment || null });
      setOrders((os) => os.map((o) => (o.id === orderId ? order : o)));
      showToast("Review submitted — thanks for the feedback.");
    } catch (err) {
      showToast(err.message || "Couldn't submit that review — try again.", "error");
      throw err; // let Account.jsx know the submit failed so it keeps the form open
    }
  };

  const handleConfirmDelivery = async (orderId) => {
    try {
      const order = await api.confirmDelivery(orderId);
      setOrders((os) => os.map((o) => (o.id === orderId ? order : o)));
      showToast("Delivery confirmed — the payment has been released to the seller.");
    } catch (err) {
      showToast(err.message || "Couldn't confirm that order — try again.", "error");
      throw err;
    }
  };

  const handleReportIssue = async (orderId, note) => {
    try {
      const order = await api.reportOrderIssue(orderId, note);
      setOrders((os) => os.map((o) => (o.id === orderId ? order : o)));
      showToast("Reported — FindIt is holding your payment while we review it.");
    } catch (err) {
      showToast(err.message || "Couldn't report that problem — try again.", "error");
      throw err; // keep the form open so they can retry
    }
  };

  const handleCheckSellerIdentityStatus = () => api.getSellerIdentityReport();
  const handlePreviewSellerIdentityBackfill = () => api.runSellerIdentityBackfill(false);
  const handleApplySellerIdentityBackfill = () => api.runSellerIdentityBackfill(true);

  const handleResolveOrderIssue = async (orderId, outcome) => {
    try {
      await api.resolveOrderIssue(orderId, outcome);
      // Drop it from the queue — it's no longer an open problem.
      setReportedOrders((os) => os.filter((o) => o.id !== orderId));
      showToast(outcome === "refunded" ? "Buyer refunded." : "Payment released to the seller.");
      api.getAdminActions().then(setAdminActions).catch(() => {});
    } catch (err) {
      showToast(err.message || "Couldn't resolve that report — try again.", "error");
      throw err;
    }
  };

  const handleAdvanceOrderStatus = async (orderId, status) => {
    try {
      const order = await api.updateOrderStatus(orderId, status);
      setOrders((os) => os.map((o) => (o.id === orderId ? order : o)));
      showToast(`Order marked "${status}".`);
    } catch (err) {
      showToast(err.message || "Couldn't update that order — try again.", "error");
    }
  };

  const handleUploadImage = async (file) => {
    try {
      return await api.uploadImage(file);
    } catch (err) {
      showToast(err.message || "Couldn't upload that image — try again.", "error");
      throw err;
    }
  };

  const handleUploadAvatar = async (file) => {
    try {
      const url = await api.uploadImage(file);
      const updated = await api.updateAvatar(url);
      onUserUpdate(updated);
    } catch (err) {
      showToast(err.message || "Couldn't update your profile photo — try again.", "error");
      throw err;
    }
  };

  const handleUpdateName = async (name) => {
    const updated = await api.updateName(name);
    onUserUpdate(updated);
  };

  const handleUpdateBusinessName = async (businessName) => {
    const updated = await api.updateBusinessName(businessName);
    onUserUpdate(updated);
    // The rename is propagated server-side to every product/order/offer row
    // that carried the old name — refetch so this seller's own dashboard
    // doesn't keep filtering by the stale name still cached client-side.
    api.getProducts().then(setProducts).catch(() => {});
    api.getOrders().then(setOrders).catch(() => {});
  };

  const handleBecomeSeller = async (businessName) => {
    const updated = await api.becomeSeller(businessName);
    onUserUpdate(updated);
    // They're a pending seller now, so the dashboard should show that state
    // rather than whatever (nothing) was cached for a buyer.
    api.getMySellerStatus().then(setMySellerStatus).catch(() => {});
    showToast("Submitted — an admin will review your seller account shortly.");
  };

  // Three possible outcomes from the server — see POST
  // /api/sellers/me/subscription: applied immediately (Free or a trial),
  // a real Paystack checkout URL to send the seller to, or "not configured"
  // when this environment has no Paystack keys yet.
  const handleChangeStorePlan = async (planId, billingPeriod) => {
    setChangingPlan(true);
    try {
      const result = await api.changeStorePlan(planId, billingPeriod);
      if (result.applied) {
        setStorePlan(await api.getMyStorePlan());
        // A downgrade may have just deactivated some of this seller's own
        // listings to fit the new limit — refresh so the dashboard reflects it.
        api.getProducts().then(setProducts).catch(() => {});
        showToast(
          result.subscription.status === "trialing"
            ? "Your trial has started — enjoy the upgrade."
            : "Your store plan has been updated."
        );
      } else if (result.configured) {
        window.location.href = result.checkoutUrl;
      } else {
        showToast(result.message || "Payments aren't set up yet — contact an admin.", "error");
      }
    } catch (err) {
      showToast(err.message || "Couldn't change your store plan — try again.", "error");
    } finally {
      setChangingPlan(false);
    }
  };

  const handleUpdateStoreBranding = async (logoUrl, bannerUrl) => {
    setSavingBranding(true);
    try {
      await api.updateStoreBranding(logoUrl, bannerUrl);
      setStoreBranding({ logoUrl, bannerUrl });
      // Every one of this seller's own listings carries these fields too
      // (see rowToProduct in lib/repo.ts) — refresh so their own storefront
      // preview and the public one both show the change immediately.
      api.getProducts().then(setProducts).catch(() => {});
      showToast("Store branding updated.");
    } catch (err) {
      showToast(err.message || "Couldn't update your store branding — try again.", "error");
      throw err;
    } finally {
      setSavingBranding(false);
    }
  };

  const handleSavePayoutAccount = async (accountNumber, bankCode) => {
    setSavingPayoutAccount(true);
    try {
      const { accountName } = await api.setPayoutAccount(accountNumber, bankCode);
      setPayoutAccount(await api.getPayoutAccount());
      showToast(`Payout account saved — ${accountName}.`);
    } catch (err) {
      showToast(err.message || "Couldn't save your payout account — try again.", "error");
      throw err;
    } finally {
      setSavingPayoutAccount(false);
    }
  };

  // Same three-outcome response shape as handleChangeStorePlan — though a
  // boost never has a free/applied-immediately outcome, so in practice this
  // is always either a checkout redirect or a "not configured" message.
  const handleBoostProduct = async (productId, boostPlanId) => {
    try {
      const result = await api.boostProduct(productId, boostPlanId);
      if (result.configured) {
        window.location.href = result.checkoutUrl;
      } else {
        showToast(result.message || "Boosting isn't set up yet — contact an admin.", "error");
      }
    } catch (err) {
      showToast(err.message || "Couldn't start payment for that boost — try again.", "error");
    }
  };

  const handleCancelStorePlan = async () => {
    setChangingPlan(true);
    try {
      await api.cancelStorePlan();
      setStorePlan(await api.getMyStorePlan());
      showToast("Your store plan has been cancelled — you're back on Free.");
    } catch (err) {
      showToast(err.message || "Couldn't cancel your store plan — try again.", "error");
    } finally {
      setChangingPlan(false);
    }
  };

  // Same three outcomes as handleChangeStorePlan above — see
  // POST /api/me/subscription.
  const handleSubscribeFindItPro = async (planId, billingPeriod) => {
    setChangingFindItPro(true);
    try {
      const result = await api.subscribeFindItPro(planId, billingPeriod);
      if (result.applied) {
        setFindItPro(await api.getFindItPro());
        showToast("You're a FindIt Pro member now.");
      } else if (result.configured) {
        window.location.href = result.checkoutUrl;
      } else {
        showToast(result.message || "Payments aren't set up yet — contact an admin.", "error");
      }
    } catch (err) {
      showToast(err.message || "Couldn't start your FindIt Pro subscription — try again.", "error");
    } finally {
      setChangingFindItPro(false);
    }
  };

  const handleCancelFindItPro = async () => {
    setChangingFindItPro(true);
    try {
      await api.cancelFindItPro();
      setFindItPro(await api.getFindItPro());
      showToast("FindIt Pro has been cancelled.");
    } catch (err) {
      showToast(err.message || "Couldn't cancel FindIt Pro — try again.", "error");
    } finally {
      setChangingFindItPro(false);
    }
  };

  const handleUpdatePhone = async (newPhone, currentPassword) => {
    const updated = await api.updatePhone(newPhone, currentPassword);
    onUserUpdate(updated);
  };

  const handleUpdatePassword = async (currentPassword, newPassword) => {
    await api.updatePassword(currentPassword, newPassword);
  };

  const handleUpdateNotificationPref = async (enabled) => {
    const updated = await api.updateNotificationPref(enabled);
    onUserUpdate(updated);
  };

  const handleCreateProduct = async (input) => {
    try {
      const product = await api.createProduct({
        ...input,
        lat: myLocation?.lat ?? null,
        lng: myLocation?.lng ?? null,
      });
      setProducts((ps) => [product, ...ps]);
      showToast("Listing added.");
    } catch (err) {
      showToast(err.message || "Couldn't add that listing — try again.", "error");
      throw err;
    }
  };

  const handleUpdateProduct = async (id, patch) => {
    try {
      const product = await api.updateProduct(id, {
        ...patch,
        lat: myLocation?.lat ?? null,
        lng: myLocation?.lng ?? null,
      });
      setProducts((ps) => ps.map((p) => (p.id === id ? product : p)));
      showToast("Listing updated.");
    } catch (err) {
      showToast(err.message || "Couldn't update that listing — try again.", "error");
      throw err;
    }
  };

  const handleDeleteProduct = async (id) => {
    try {
      await api.deleteProduct(id);
      setProducts((ps) => ps.filter((p) => p.id !== id));
      showToast("Listing removed.");
    } catch (err) {
      showToast(err.message || "Couldn't remove that listing — try again.", "error");
    }
  };

  const handleMarkNotificationRead = async (id) => {
    setNotifications((ns) => ns.map((n) => (n.id === id ? { ...n, unread: false } : n)));
    try {
      await api.markNotificationRead(id);
    } catch {
      // best-effort: local state already reflects the read state
    }
  };

  const handleMarkAllRead = async () => {
    setNotifications((ns) => ns.map((n) => ({ ...n, unread: false })));
    try {
      await api.markAllNotificationsRead();
    } catch {
      // best-effort
    }
  };

  const handleReviewSellerVerification = async (sellerId, action, reason) => {
    try {
      await api.reviewSellerVerification(sellerId, action, reason);
      setSellerVerifications((subs) => subs.filter((s) => s.sellerId !== sellerId));
      showToast(
        action === "approved" ? "Seller verified." : action === "needs_info" ? "Asked the seller for more information." : "Verification rejected."
      );
      api.getAdminActions().then(setAdminActions).catch(() => {});
    } catch (err) {
      showToast(err.message || "Couldn't update that verification — try again.", "error");
      throw err;
    }
  };

  const handleSellerStatusChange = async (id, status, reason) => {
    const seller = sellers.find((s) => s.id === id);
    setSellers((ss) => ss.map((s) => (s.id === id ? { ...s, status } : s)));
    try {
      await api.setSellerStatus(id, status, reason);
      showToast(`${seller?.name || "Seller"} ${status}.`);
      api.getAdminActions().then(setAdminActions).catch(() => {});
    } catch (err) {
      setSellers((ss) => ss.map((s) => (s.id === id ? { ...s, status: seller.status } : s)));
      showToast(err.message || "Couldn't update that seller — try again.", "error");
      throw err;
    }
  };

  const handleLookupUser = (phone) => api.lookupUserByPhone(phone);

  const handleLoadUsers = (params) => api.getAdminUsers(params);

  const handleSetUserSuspended = async (id, suspended, reason) => {
    try {
      const updated = await api.setUserSuspended(id, suspended, reason);
      showToast(suspended ? `${updated.name} suspended.` : `${updated.name} reactivated.`);
      api.getAdminActions().then(setAdminActions).catch(() => {});
      return updated;
    } catch (err) {
      showToast(err.message || "Couldn't update that account — try again.", "error");
      throw err;
    }
  };

  const handleLoadFeeConfig = () => api.getFeeConfig();

  const handleSetFeeConfig = async (feeBps) => {
    const updated = await api.setFeeConfig(feeBps);
    api.getAdminActions().then(setAdminActions).catch(() => {});
    return updated;
  };

  const handleLoadPayouts = (status) => api.getPayouts(status);

  const handleMarkPayoutPaid = (id) => api.markPayoutPaid(id);

  const handleLoadPlans = () => api.getAdminSubscriptionPlans();

  const handleUpdatePlan = async (id, patch) => {
    const updated = await api.updateSubscriptionPlan(id, patch);
    api.getAdminActions().then(setAdminActions).catch(() => {});
    // MRR and the paid/free subscription counts on the Overview tab are
    // computed from live plan prices — refresh so a price edit shows up
    // there immediately.
    api.getAdminOverview().then(setAdminOverview).catch(() => {});
    return updated;
  };

  const handleLoadBoostPlans = () => api.getAdminBoostPlans();

  const handleUpdateBoostPlan = async (id, patch) => {
    const updated = await api.updateAdminBoostPlan(id, patch);
    api.getAdminActions().then(setAdminActions).catch(() => {});
    // The seller-facing boost picker (SellerDashboard) reads this same list
    // — refresh so a price/duration edit shows up there immediately.
    api.getBoostPlans().then(setBoostPlans).catch(() => {});
    return updated;
  };

  const handleLoadRiskSignals = () => api.getRiskSignals();

  // Admin-facing side of the same support tickets buyers/sellers open from
  // Help & support — see AdminQueue.jsx's SupportAdmin/AdminTicketThread,
  // which keep the ticket list + open conversation local to that tab rather
  // than a global overlay, since these are thin passthroughs to the API.
  const handleLoadAdminTickets = (status) => api.getAdminTickets(status);
  const handleLoadAdminTicket = (id) => api.getAdminTicket(id);
  const handleSendAdminTicketMessage = (id, body) => api.sendAdminTicketMessage(id, body);
  const handleResolveTicket = async (id) => {
    const updated = await api.resolveTicket(id);
    api.getAdminActions().then(setAdminActions).catch(() => {});
    return updated;
  };

  const handleLoadAnalytics = (days) => api.getAdminAnalytics(days);

  const handleLoadAlerts = () => api.getAdminAlerts();

  const handleLoadCategories = () => api.getAdminCategories();

  const handleCreateCategory = async (label, iconKey, sortOrder) => {
    const created = await api.createCategory(label, iconKey, sortOrder);
    applyCategoryOverrides([created]);
    api.getAdminActions().then(setAdminActions).catch(() => {});
    return created;
  };

  const handleUpdateCategory = async (id, patch) => {
    const updated = await api.updateCategory(id, patch);
    applyCategoryOverrides([updated]);
    api.getAdminActions().then(setAdminActions).catch(() => {});
    return updated;
  };

  const handlePromoteToAdmin = async (phone, adminRole) => {
    const promoted = await api.promoteToAdmin(phone, adminRole);
    api.getAdminActions().then(setAdminActions).catch(() => {});
    return promoted;
  };

  const handleDemoteFromAdmin = async (phone) => {
    const demoted = await api.demoteFromAdmin(phone);
    api.getAdminActions().then(setAdminActions).catch(() => {});
    return demoted;
  };

  const handleSendOffer = async (requestId, offerInput) => {
    try {
      await api.sendSellerOffer(requestId, offerInput);
      setRequests(await api.getOpenRequests());
      showToast("Offer sent to the customer.");
    } catch (err) {
      showToast(err.message || "Couldn't send that offer — try again.", "error");
      throw err;
    }
  };

  const handleAcceptOffer = async (requestId, offerId) => {
    try {
      const order = await api.acceptOffer(requestId, offerId);
      setOrders((os) => [order, ...os]);
      setMyRequests((rs) =>
        rs.map((r) =>
          r.id === requestId
            ? { ...r, status: "matched", offers: r.offers.map((o) => (o.id === offerId ? { ...o, accepted: true } : o)) }
            : r
        )
      );
      showToast("Order placed — track it in My orders.");
    } catch (err) {
      showToast(err.message || "Couldn't accept that offer — try again.", "error");
    }
  };

  const handleOpenThread = async (id, otherParty) => {
    setActiveThread({ id, otherParty });
    setThreadLoading(true);
    try {
      const messages = await api.getMessages(id);
      setThreadMessages(messages);
      setConversations((cs) => cs.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)));
    } catch (err) {
      showToast(err.message || "Couldn't load that conversation — try again.", "error");
    } finally {
      setThreadLoading(false);
    }
  };

  const handleSendMessage = async (conversationId, body) => {
    try {
      const message = await api.sendMessage(conversationId, body);
      setThreadMessages((ms) => [...ms, message]);
    } catch (err) {
      showToast(err.message || "Couldn't send that message — try again.", "error");
    }
  };

  // Real support tickets — reuses <Thread> for the conversation itself
  // (see the `mine` mapping below), the same overlay pattern as
  // activeThread/handleOpenThread above.
  const handleOpenTicket = async (id) => {
    setActiveTicket(tickets.find((t) => t.id === id) || { id, subject: "Support" });
    setTicketLoading(true);
    try {
      const { ticket, messages } = await api.getTicket(id);
      setActiveTicket(ticket);
      setTicketMessages(messages.map((m) => ({ ...m, mine: !m.isAdmin })));
      setTickets((ts) => ts.map((t) => (t.id === id ? { ...t, userHasUnread: false } : t)));
    } catch (err) {
      showToast(err.message || "Couldn't load that ticket — try again.", "error");
    } finally {
      setTicketLoading(false);
    }
  };

  const handleCreateTicket = async (subject, body) => {
    try {
      const ticket = await api.createTicket(subject, body);
      setTickets((ts) => [ticket, ...ts]);
      showToast("Ticket sent — we'll reply here.");
      await handleOpenTicket(ticket.id);
    } catch (err) {
      showToast(err.message || "Couldn't send that ticket — try again.", "error");
      throw err;
    }
  };

  const handleSendTicketMessage = async (ticketId, body) => {
    try {
      const message = await api.sendTicketMessage(ticketId, body);
      setTicketMessages((ms) => [...ms, { ...message, mine: true }]);
    } catch (err) {
      showToast(err.message || "Couldn't send that message — try again.", "error");
    }
  };

  // Same "no websocket, just poll while open" approach as activeThread.
  useEffect(() => {
    if (!activeTicket) return;
    const interval = setInterval(() => {
      api.getTicket(activeTicket.id).then(({ messages }) => {
        setTicketMessages(messages.map((m) => ({ ...m, mine: !m.isAdmin })));
      }).catch(() => {});
    }, 4000);
    return () => clearInterval(interval);
  }, [activeTicket?.id]);

  // The seller side of contacting the other party — scoped to a real order
  // of theirs (enforced server-side too), not a free-form "message any
  // buyer" search.
  const handleMessageBuyer = async (order) => {
    try {
      const { conversationId, buyer } = await api.messageBuyerAboutOrder(order.id);
      setActiveThread({ id: conversationId, otherParty: buyer });
      setThreadLoading(true);
      const messages = await api.getMessages(conversationId);
      setThreadMessages(messages);
    } catch (err) {
      showToast(err.message || "Couldn't start that conversation — try again.", "error");
      throw err; // let the button know so it can stop its own loading state
    } finally {
      setThreadLoading(false);
    }
  };

  // A reply doesn't show up on its own otherwise — getMessages only ever
  // ran once, when the thread was first opened. Polling is a simple, safe
  // way to make an open conversation feel live without a websocket.
  useEffect(() => {
    if (!activeThread) return;
    const interval = setInterval(() => {
      api.getMessages(activeThread.id).then(setThreadMessages).catch(() => {});
    }, 4000);
    return () => clearInterval(interval);
  }, [activeThread?.id]);

  const handleContactSeller = async (product) => {
    if (!user) {
      showToast("Log in to message a seller.", "error");
      return;
    }
    try {
      const conversationId = await api.startConversation(product.seller);
      setActiveThread({ id: conversationId, otherParty: { businessName: product.seller, name: product.seller } });
      setThreadLoading(true);
      setProduct(null);
      const messages = await api.getMessages(conversationId);
      setThreadMessages(messages);
    } catch (err) {
      showToast(err.message || "Couldn't start that conversation — try again.", "error");
    } finally {
      setThreadLoading(false);
    }
  };

  if (!loaded) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#FAFAFF]">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-4 border-[#ECE9F7]" />
          <div className="absolute inset-0 rounded-full border-4 border-[#7C3AED] border-t-transparent animate-spin" />
        </div>
        <p className="text-[13px] text-[#6B6483]">Loading FindIt…</p>
      </div>
    );
  }

  // A listing a plan downgrade deactivated still exists (see
  // lib/subscriptions.ts) but shouldn't show up to buyers — only on the
  // owning seller's own dashboard, where it's marked as hidden.
  const buyerVisibleProducts = products.filter((p) => p.active !== false);

  return (
    <div className="min-h-screen bg-[#FAFAFF]" style={{ fontFamily: "'Work Sans', sans-serif" }}>
      {screen !== "home" && (
        <header className="sticky top-0 z-30 bg-[#FAFAFF]/95 backdrop-blur border-b border-[#ECE9F7] px-5 py-3 flex items-center gap-2">
          <IconButton onClick={goBack} aria-label="Back">
            <ChevronLeft size={18} className="text-[#1E1B4B]" />
          </IconButton>
          <button onClick={() => go("home")} className="flex items-center gap-2">
            <Logo size={26} />
            <Wordmark />
          </button>
        </header>
      )}

      <main className="pb-24">
        {screen === "home" && (
          <Home
            go={go}
            openProduct={setProduct}
            products={buyerVisibleProducts}
            unreadCount={notifications.filter((n) => n.unread).length}
            savedIds={savedIds}
            onToggleSaved={handleToggleSaved}
            myLocation={myLocation}
            locationStatus={locationStatus}
            onEnableLocation={handleEnableLocation}
          />
        )}
        {screen === "browse" && (
          <Browse
            initialGroup={browseGroup}
            openProduct={setProduct}
            products={buyerVisibleProducts}
            savedIds={savedIds}
            onToggleSaved={handleToggleSaved}
            myLocation={myLocation}
          />
        )}
        {screen === "storePlans" && (
          isSeller ? (
            <StorePlans
              storePlan={storePlan}
              onChangePlan={handleChangeStorePlan}
              onCancelPlan={handleCancelStorePlan}
              changing={changingPlan}
              go={go}
            />
          ) : (
            <RoleGate
              title="Seller access needed"
              message="Store plans belong to seller accounts."
              onLogout={onLogout}
              logoutLabel="Log out"
            />
          )
        )}
        {screen === "findItPro" && (
          user ? (
            <FindItPro
              findItPro={findItPro}
              onSubscribe={handleSubscribeFindItPro}
              onCancel={handleCancelFindItPro}
              changing={changingFindItPro}
              go={go}
            />
          ) : (
            <RoleGate
              title="Sign in needed"
              message="FindIt Pro is a membership for signed-in accounts."
              onLogout={onLogout}
              logoutLabel="Log out"
            />
          )
        )}
        {screen === "sellerOnboarding" && (
          isSeller ? (
            <SellerOnboarding go={go} showToast={showToast} />
          ) : (
            <RoleGate
              title="Seller access needed"
              message="Seller verification belongs to seller accounts."
              onLogout={onLogout}
              logoutLabel="Log out"
            />
          )
        )}
        {screen === "request" && (
          <RequestForm go={go} showToast={showToast} myLocation={myLocation} />
        )}
        {screen === "myRequests" && (
          <MyRequests requests={myRequests} onAcceptOffer={handleAcceptOffer} />
        )}
        {screen === "seller" && (
          isSeller ? (
            <SellerDashboard
              requests={requests}
              onSendOffer={handleSendOffer}
              user={user}
              orders={orders}
              onAdvanceOrderStatus={handleAdvanceOrderStatus}
              products={products}
              onCreateProduct={handleCreateProduct}
              onUpdateProduct={handleUpdateProduct}
              onDeleteProduct={handleDeleteProduct}
              onUploadImage={handleUploadImage}
              onMessageBuyer={handleMessageBuyer}
              myLocation={myLocation}
              storePlan={storePlan}
              storeBranding={storeBranding}
              onUpdateBranding={handleUpdateStoreBranding}
              savingBranding={savingBranding}
              verification={verification}
              payoutAccount={payoutAccount}
              banks={banks}
              onSavePayoutAccount={handleSavePayoutAccount}
              savingPayoutAccount={savingPayoutAccount}
              boostPlans={boostPlans}
              onBoostProduct={handleBoostProduct}
              go={go}
            />
          ) : (
            <RoleGate
              title="Seller access needed"
              message="This dashboard belongs to seller accounts. Sign up with a seller account (or log in with one) to respond to customer requests here."
              onLogout={onLogout}
              logoutLabel="Log out"
            />
          )
        )}
        {screen === "admin" && (
          isAdmin ? (
            <AdminQueue
              sellers={sellers}
              requests={requests}
              onSellerStatusChange={handleSellerStatusChange}
              adminActions={adminActions}
              otpStats={otpStats}
              overview={adminOverview}
              reportedOrders={reportedOrders}
              onResolveOrderIssue={handleResolveOrderIssue}
              onCheckSellerIdentityStatus={handleCheckSellerIdentityStatus}
              onPreviewSellerIdentityBackfill={handlePreviewSellerIdentityBackfill}
              onApplySellerIdentityBackfill={handleApplySellerIdentityBackfill}
              onLookupUser={handleLookupUser}
              onPromoteToAdmin={handlePromoteToAdmin}
              onDemoteFromAdmin={handleDemoteFromAdmin}
              currentAdminId={user.id}
              currentAdminRole={user.adminRole}
              showToast={showToast}
              sellerVerifications={sellerVerifications}
              onReviewSellerVerification={handleReviewSellerVerification}
              onLoadUsers={handleLoadUsers}
              onSetUserSuspended={handleSetUserSuspended}
              onLoadFeeConfig={handleLoadFeeConfig}
              onSetFeeConfig={handleSetFeeConfig}
              onLoadPayouts={handleLoadPayouts}
              onMarkPayoutPaid={handleMarkPayoutPaid}
              onLoadPlans={handleLoadPlans}
              onUpdatePlan={handleUpdatePlan}
              onLoadBoostPlans={handleLoadBoostPlans}
              onUpdateBoostPlan={handleUpdateBoostPlan}
              onLoadCategories={handleLoadCategories}
              onCreateCategory={handleCreateCategory}
              onUpdateCategory={handleUpdateCategory}
              onLoadRiskSignals={handleLoadRiskSignals}
              onLoadTickets={handleLoadAdminTickets}
              onLoadTicket={handleLoadAdminTicket}
              onSendTicketMessage={handleSendAdminTicketMessage}
              onResolveTicket={handleResolveTicket}
              onLoadAnalytics={handleLoadAnalytics}
              onLoadAlerts={handleLoadAlerts}
            />
          ) : (
            <RoleGate
              title="Admin access needed"
              message="This queue is staff-only. Log in with an admin account to verify sellers and review unmatched requests."
              onLogout={onLogout}
              logoutLabel="Log out"
            />
          )
        )}
        {screen === "profile" && (
          <Profile
            go={go}
            user={user}
            onLogout={onLogout}
            unreadCount={notifications.filter((n) => n.unread).length}
            messageUnreadCount={conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0)}
            onUploadAvatar={handleUploadAvatar}
            sellerStatus={mySellerStatus}
            findItPro={findItPro}
          />
        )}
        {screen === "accountDetails" && (
          <AccountDetails
            user={user}
            onUpdateName={handleUpdateName}
            onUpdateBusinessName={handleUpdateBusinessName}
            onUpdatePhone={handleUpdatePhone}
            onUpdatePassword={handleUpdatePassword}
            showToast={showToast}
          />
        )}
        {screen === "becomeSeller" && (
          <BecomeSeller user={user} onBecomeSeller={handleBecomeSeller} go={go} />
        )}
        {screen === "notifPrefs" && (
          <NotificationPreferences user={user} onToggle={handleUpdateNotificationPref} showToast={showToast} />
        )}
        {screen === "help" && (
          <HelpSupport tickets={tickets} onOpenTicket={handleOpenTicket} onCreateTicket={handleCreateTicket} />
        )}
        {screen === "about" && <About />}
        {screen === "messages" && (
          <Messages conversations={conversations} onOpenThread={handleOpenThread} />
        )}
        {screen === "account" && (
          <Account
            openProduct={setProduct}
            orders={orders}
            products={products}
            onReview={handleReview}
            onConfirmDelivery={handleConfirmDelivery}
            onReportIssue={handleReportIssue}
            onPayOrder={api.payForOrder}
            showToast={showToast}
            savedIds={savedIds}
          />
        )}
        {screen === "notifications" && (
          <Notifications
            notifications={notifications}
            onMarkRead={handleMarkNotificationRead}
            onMarkAllRead={handleMarkAllRead}
          />
        )}
        {screen === "checkout" && checkoutOrder && (
          <Checkout
            order={checkoutOrder.order}
            product={checkoutOrder.product}
            qty={checkoutOrder.qty}
            condition={checkoutOrder.condition}
            onPay={api.payForOrder}
            showToast={showToast}
            go={go}
          />
        )}
      </main>

      {product && (
        <ProductDetail
          product={product}
          onClose={() => setProduct(null)}
          go={go}
          onBuyNow={buyNow}
          onContact={handleContactSeller}
          onViewSeller={handleViewSeller}
          savedIds={savedIds}
          onToggleSaved={handleToggleSaved}
          myLocation={myLocation}
        />
      )}

      {viewedSeller && (
        <SellerProfile
          sellerName={viewedSeller}
          products={products}
          onBack={() => setViewedSeller(null)}
          onOpenProduct={handleOpenProductFromSeller}
          onContact={handleContactSeller}
          myLocation={myLocation}
        />
      )}

      {activeThread && (
        <Thread
          conversationId={activeThread.id}
          otherParty={activeThread.otherParty}
          messages={threadMessages}
          loading={threadLoading}
          onBack={() => setActiveThread(null)}
          onSend={handleSendMessage}
        />
      )}

      {activeTicket && (
        <Thread
          conversationId={activeTicket.id}
          otherParty={{ name: activeTicket.subject || "Support" }}
          messages={ticketMessages}
          loading={ticketLoading}
          onBack={() => setActiveTicket(null)}
          onSend={handleSendTicketMessage}
        />
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-30 px-6 pb-6 pt-2 flex justify-center">
        <div
          className="flex items-center gap-1 rounded-full shadow-2xl px-3 py-2.5"
          style={{ background: "linear-gradient(135deg,#1E1B4B,#3B1874)" }}
        >
          {TABS.map((t) => {
            const activeKey = ["account", "notifications", "accountDetails", "notifPrefs", "help", "about", "becomeSeller"].includes(screen)
              ? "profile"
              : screen;
            const active = activeKey === t.key;
            return (
              <button
                key={t.key}
                onClick={() => go(t.key)}
                aria-label={t.label}
                className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-all"
                style={active ? { background: "linear-gradient(135deg,#FCD34D,#F59E0B)" } : {}}
              >
                <t.icon size={18} className={active ? "text-[#3B1874]" : "text-white/70"} strokeWidth={active ? 2.3 : 1.8} />
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
