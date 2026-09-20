"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import {
  Home as HomeIcon, Search, PackageSearch, LayoutDashboard, ShieldCheck, User, ChevronLeft,
} from "lucide-react";
import { Logo, Wordmark, RoleGate } from "./shared";
import { IconButton } from "./sharedMotion";
import { api, setAdminLockedHandler } from "./api";
import { getStoredLocation, requestBrowserLocation } from "./location";
import { getStoredCart, storeCart } from "./cart";
import { applyCategoryOverrides } from "./data";
import Home from "./Home";
import Browse from "./Browse";
import RequestForm from "./RequestForm";
import SellerDashboard from "./SellerDashboard";
import StorePlans from "./StorePlans";
import FindItPro from "./FindItPro";
import SellerOnboarding from "./SellerOnboarding";
import AdminQueue from "./AdminQueue";
import AdminLogin from "./AdminLogin";
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
import Cart from "./Cart";
import Messages from "./Messages";
import Thread from "./Thread";
import SellerProfile from "./SellerProfile";
import SellerDirectory from "./SellerDirectory";
import MyRequests from "./MyRequests";

function tabsFor(role) {
  const middle =
    role === "admin"
      ? { key: "admin", label: "Admin", icon: ShieldCheck }
      : { key: "seller", label: role === "seller" ? "Dashboard" : "Sell", icon: LayoutDashboard };
  return [
    { key: "home", label: "Home", icon: HomeIcon },
    { key: "browse", label: "Search", icon: Search },
    { key: "request", label: "Request", icon: PackageSearch },
    middle,
    { key: "profile", label: "Profile", icon: User },
  ];
}

export default function MainApp({ user, onLogout, showToast, onUserUpdate, preloadedMainData }) {
  const isSeller = user?.role === "seller";
  const isAdmin = user?.role === "admin";
  const TABS = tabsFor(user?.role);

  const [screen, setScreen] = useState("home");
  const [browseGroup, setBrowseGroup] = useState("all");
  const [sellerQuery, setSellerQuery] = useState("");
  const [product, setProduct] = useState(null);
  // The seller storefront being viewed. `key` is what the profile was opened
  // by (a seller id where the listing has one, otherwise the business name);
  // `profile` is what the server returned for it. The screen renders from the
  // server's public DTO, never from the local products array — see
  // SellerProfile.jsx for why that mattered.
  const [viewedSeller, setViewedSeller] = useState(null);
  const [viewedSellerProfile, setViewedSellerProfile] = useState(null);
  const [viewedSellerLoading, setViewedSellerLoading] = useState(false);
  const [viewedSellerError, setViewedSellerError] = useState(null);
  const [checkoutOrder, setCheckoutOrder] = useState(null);
  // Lives on this device only (see cart.js) — loaded from localStorage once
  // the component has mounted (line below, not in this initializer, so the
  // very first render matches server output and there's no hydration
  // mismatch), then kept in sync with it on every change.
  const [cart, setCart] = useState([]);
  const [checkingOutCart, setCheckingOutCart] = useState(false);

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
  // Bumped on every open/back so a slow getMessages response from a thread
  // the buyer already left can't land late and overwrite whatever they
  // opened next (or resurrect the thread after they went back).
  const threadRequestRef = useRef(0);
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
  // How many items are in the admin Alert Center right now — shown as a nav
  // badge (see the bottom nav below) so an admin sees something needs
  // attention without having to open the Admin tab and click into Alerts.
  const [adminAlertCount, setAdminAlertCount] = useState(0);

  // Does this session currently hold a staff unlock? Being an admin is not
  // enough — the Admin Queue needs a second sign-in that ages out (see
  // AdminLogin.jsx and lib/adminRoles.ts#requireAdmin). This flag only
  // decides which screen to show; the server checks the real unlock on every
  // admin call, so a tampered client gains nothing here.
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [mySellerStatus, setMySellerStatus] = useState(null); // pending | approved | rejected | null
  // This account's own sellers.id | null — the unambiguous key SellerDashboard
  // needs to tell "my listings/orders" apart from a same-named seller's, since
  // business_name has no uniqueness constraint. See GET /api/sellers/me.
  const [mySellerId, setMySellerId] = useState(null);
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
  const [savingDescription, setSavingDescription] = useState(false);
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
  // The seller's own dedicated storefront: slug, public URL, and whether the
  // live plan publishes it. Server-decided (lib/store.ts) — this only holds
  // the answer.
  const [myStore, setMyStore] = useState(null);
  const [claimingStore, setClaimingStore] = useState(false);
  // Verified transaction records this person is a party to, as buyer or
  // seller. Created server-side at completion; the UI only reflects what
  // exists, never asserts a record from an order's status.
  const [transactionRecords, setTransactionRecords] = useState([]);

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

  // Loaded once, client-side only — the initializer above intentionally
  // doesn't read localStorage directly, so the very first render matches
  // what the server would have produced and there's no hydration mismatch.
  useEffect(() => {
    setCart(getStoredCart());
  }, []);

  useEffect(() => {
    storeCart(cart);
  }, [cart]);

  useEffect(() => {
    // Real, admin-editable categories (lib/categoryCatalog.ts) — fetched
    // once here (works for a signed-out guest browsing Home too) and
    // applied on top of the static default GROUPS already has, so an
    // admin's rename/deactivate shows up without a deploy. See
    // applyCategoryOverrides in ./data for why this isn't setState.
    api.getCategories().then(applyCategoryOverrides).catch(() => {});

    // App.jsx starts this same fetch as soon as the session check resolves
    // — overlapping it with the splash screen's own display time instead of
    // only starting once MainApp mounts (i.e. after the splash has already
    // finished). Without preloadedMainData, this "Loading FindIt…" screen
    // below was stacked sequentially after the splash on every refresh
    // instead of overlapping it, most noticeable on a slower connection.
    // Falls back to firing fresh requests when there's nothing preloaded —
    // a brand-new login doesn't go through that session-check path at all.
    const mainData = preloadedMainData ?? Promise.all([api.getProducts(), api.getOrders(), api.getNotifications()]);
    mainData
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
      api.getMySellerId().then(setMySellerId).catch(() => {});
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
      api.getAdminAlerts().then((alerts) => setAdminAlertCount(alerts.length)).catch(() => {});
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
      // Same reasoning: fetched here (not just on navigating to My requests)
      // so Home's "your activity" card can surface a waiting offer up front —
      // a buyer would otherwise only find out by opening My requests blind.
      api.getMyRequests().then(setMyRequests).catch(() => {});
    } else {
      setSavedIds([]);
    }
  }, [user?.id]);

  // Notifications otherwise only ever loaded once, in the effect above —
  // someone sitting in the app never saw a new order/reply/resolution
  // arrive, no matter how long they stayed, since nothing refetched the
  // list or the bell badge. Same "no websocket, just poll" approach already
  // used for an open message thread/support ticket in this file, but slower
  // (60s, not 4s): a notification isn't as time-sensitive as a live chat,
  // and this one runs for the whole session rather than only while one
  // screen is open. Replacing state wholesale on every tick is safe because
  // handleMarkNotificationRead/handleMarkAllNotificationsRead below already
  // await the server call before touching local state — by the time a tick
  // fires, the server has long since caught up with anything the user did.
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      api.getNotifications().then(setNotifications).catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
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
  const navigateTo = (target, group) => {
    // The Admin Queue sits behind a second, explicit staff sign-in. Heading
    // there without a live unlock lands on that screen instead. This is
    // convenience, not access control — every admin route refuses a locked
    // session on its own.
    const s = target === "admin" && isAdmin && !adminUnlocked ? "adminLogin" : target;
    setScreen(s);
    if (s === "browse") setBrowseGroup(group || "all"); // always reset unless a category was explicitly passed
    if (s === "sellers") setSellerQuery(group || ""); // same convention: reset unless a search term was explicitly passed
    setProduct(null); // close any open product detail overlay when navigating
    // Clear the whole storefront overlay, not just its key — leaving the
    // fetched profile behind would flash the previous seller's store the
    // next time one is opened.
    setViewedSeller(null);
    setViewedSellerProfile(null);
    setViewedSellerError(null);
    setViewedSellerLoading(false);
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
    if (s === "seller" && isSeller) {
      api.getMyStore().then(setMyStore).catch(() => {});
    }
    if (s === "account" || s === "seller") {
      api.getMyTransactionRecords().then(setTransactionRecords).catch(() => {});
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
    if (s === "notifications" && user) {
      api.getNotifications().then(setNotifications).catch(() => {});
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

  // Opened with a seller id wherever the listing carries one; falls back to
  // the business name for listings created before migration 009's backfill.
  // The server refuses to guess when a name maps to two accounts, and that
  // 409 is surfaced here rather than silently showing the wrong store.
  const handleViewSeller = async (sellerKey) => {
    if (!sellerKey) return;
    setProduct(null);
    setViewedSeller(sellerKey);
    setViewedSellerProfile(null);
    setViewedSellerError(null);
    setViewedSellerLoading(true);
    try {
      setViewedSellerProfile(await api.getSellerProfile(sellerKey));
    } catch (err) {
      setViewedSellerError(err.message || "Couldn't load this store.");
    } finally {
      setViewedSellerLoading(false);
    }
  };

  const handleClaimStore = async () => {
    setClaimingStore(true);
    try {
      await api.claimMyStore();
      setMyStore(await api.getMyStore());
      showToast("Your store link is live.");
    } catch (err) {
      showToast(err.message || "Couldn't create your store link.", "error");
    } finally {
      setClaimingStore(false);
    }
  };

  const closeSellerProfile = () => {
    setViewedSeller(null);
    setViewedSellerProfile(null);
    setViewedSellerError(null);
    setViewedSellerLoading(false);
  };

  const handleOpenProductFromSeller = (p) => {
    closeSellerProfile();
    setProduct(p);
  };

  const buyNow = async (prod, qty) => {
    try {
      // Only productId/qty go to the server — it looks up the real product
      // and computes price/seller itself, so nothing here is trusted as-is.
      const order = await api.createOrder({ productId: prod.id, qty });
      setOrders((os) => [order, ...os]);
      setCheckoutOrder({ order, product: prod, qty });
      go("checkout");
    } catch (err) {
      showToast(err.message || "Couldn't place that order — try again.", "error");
    }
  };

  const handleAddToCart = async (prod, qty) => {
    setCart((c) => {
      const existing = c.find((it) => it.productId === prod.id);
      if (existing) {
        return c.map((it) => (it.productId === prod.id ? { ...it, qty: it.qty + qty } : it));
      }
      return [...c, { productId: prod.id, qty, addedAt: Date.now() }];
    });
    showToast("Added to cart.");
  };

  const handleUpdateCartQty = (productId, qty) => {
    setCart((c) =>
      qty <= 0
        ? c.filter((it) => it.productId !== productId)
        : c.map((it) => (it.productId === productId ? { ...it, qty } : it))
    );
  };

  const handleRemoveFromCart = (productId) => {
    setCart((c) => c.filter((it) => it.productId !== productId));
  };

  // One createOrder call per line, same as a direct "Buy now" — a cart is
  // just a staging list, not a new kind of order. Each order can already be
  // paid individually from My orders (Account.jsx), so there's no separate
  // multi-item payment flow to build here.
  const handleCartCheckout = async () => {
    setCheckingOutCart(true);
    const createdOrders = [];
    const remaining = [...cart];
    try {
      for (const item of cart) {
        const order = await api.createOrder({ productId: item.productId, qty: item.qty });
        createdOrders.push(order);
        remaining.shift(); // this line succeeded — it's a real order now, not still "in the cart"
      }
      setCart([]);
      showToast(`${createdOrders.length} order${createdOrders.length === 1 ? "" : "s"} placed — pay from My orders.`);
      go("account");
    } catch (err) {
      // A failure partway through must never lose a line that already
      // became a real order, and must never re-attempt one that did —
      // only what's still unprocessed goes back into the cart.
      setCart(remaining);
      showToast(
        createdOrders.length > 0
          ? `${createdOrders.length} order${createdOrders.length === 1 ? "" : "s"} placed. The rest couldn't be — ${err.message || "try again"}.`
          : err.message || "Couldn't complete checkout — try again.",
        "error"
      );
    } finally {
      if (createdOrders.length > 0) {
        setOrders((os) => [...createdOrders, ...os]);
      }
      setCheckingOutCart(false);
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

  // Deliberately separate from the verification wizard's submit — that one
  // resets verification_status to 'pending' on every save, which is right
  // for the fields that actually describe the business but would cost a
  // seller their Verified/Trusted badge just for fixing a typo in their
  // bio. This updates the bio alone and merges it straight into the local
  // `verification` object so whatever already reads verification.description
  // reflects it immediately, without a full refetch.
  const handleUpdateSellerDescription = async (description) => {
    setSavingDescription(true);
    try {
      await api.updateSellerDescription(description);
      setVerification((v) => (v ? { ...v, description: description?.trim() || null } : v));
      showToast("Bio updated.");
    } catch (err) {
      showToast(err.message || "Couldn't update your bio — try again.", "error");
      throw err;
    } finally {
      setSavingDescription(false);
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

  const handleSendBroadcast = (title, body, audience) => api.sendAdminBroadcast(title, body, audience);

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

  const handleLoadModerationRules = () => api.getModerationRules();

  const handleCreateModerationRule = async (keyword, reason, severity) => {
    const created = await api.createModerationRule(keyword, reason, severity);
    api.getAdminActions().then(setAdminActions).catch(() => {});
    return created;
  };

  const handleUpdateModerationRule = async (id, patch) => {
    const updated = await api.updateModerationRule(id, patch);
    api.getAdminActions().then(setAdminActions).catch(() => {});
    return updated;
  };

  const handleLoadFlaggedProducts = () => api.getFlaggedProducts();

  // Patches the already-loaded product locally rather than refetching — the
  // moderate response only carries the moderation fields, not a full
  // Product, so replacing the whole row would drop everything else the
  // client already has (same idea as applyCategoryOverrides above).
  const handleModerateProduct = async (id, status, reason) => {
    const result = await api.moderateProduct(id, status, reason);
    setProducts((ps) =>
      ps.map((p) => (p.id === id ? { ...p, moderationStatus: result.moderationStatus, moderationReason: result.moderationReason } : p))
    );
    api.getAdminActions().then(setAdminActions).catch(() => {});
    return result;
  };

  const handleLoadProductReports = () => api.getProductReports();

  const handleResolveProductReport = async (reportId, outcome, productId, productName) => {
    const result = await api.resolveProductReport(reportId, outcome, null, productId, productName);
    if (result.removed && productId) {
      setProducts((ps) => ps.map((p) => (p.id === productId ? { ...p, moderationStatus: "removed" } : p)));
    }
    api.getAdminActions().then(setAdminActions).catch(() => {});
    return result;
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

  const handleCancelRequest = async (requestId) => {
    try {
      const updated = await api.cancelRequest(requestId);
      setMyRequests((rs) => rs.map((r) => (r.id === requestId ? { ...r, status: updated.status } : r)));
      showToast("Request cancelled.");
    } catch (err) {
      showToast(err.message || "Couldn't cancel that request — try again.", "error");
    }
  };

  const handleOpenThread = async (id, otherParty) => {
    const requestId = ++threadRequestRef.current;
    setActiveThread({ id, otherParty });
    setThreadLoading(true);
    try {
      const messages = await api.getMessages(id);
      if (threadRequestRef.current !== requestId) return; // superseded by a newer open/back
      setThreadMessages(messages);
      setConversations((cs) => cs.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)));
    } catch (err) {
      if (threadRequestRef.current === requestId) {
        showToast(err.message || "Couldn't load that conversation — try again.", "error");
      }
    } finally {
      if (threadRequestRef.current === requestId) setThreadLoading(false);
    }
  };

  const handleSendMessage = async (conversationId, body) => {
    try {
      const message = await api.sendMessage(conversationId, body);
      setThreadMessages((ms) => [...ms, message]);
    } catch (err) {
      showToast(err.message || "Couldn't send that message — try again.", "error");
      throw err;
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

  // Refresh the Alert Center nav badge whenever an admin actually opens the
  // Admin tab — resolving an alert (marking a ticket resolved, paying out a
  // seller manually, etc.) happens inside that tab, so leaving and coming
  // back is the natural point to recheck rather than polling constantly.
  useEffect(() => {
    if (screen !== "admin" || !isAdmin) return;
    api.getAdminAlerts().then((alerts) => setAdminAlertCount(alerts.length)).catch(() => {});
  }, [screen, isAdmin]);

  // Leaving admin mode clears the unlock server-side but keeps the person
  // logged in as themselves — stepping out of the admin area, not out of the
  // app. The local flag drops either way: if the call failed, the next admin
  // request will be refused anyway, and showing the queue as open would be
  // the wrong lie to tell.
  const handleLeaveAdmin = async () => {
    try {
      await api.endAdminSession();
      showToast("Left admin mode.");
    } catch (err) {
      showToast(err.message || "Couldn't end your admin session cleanly.", "error");
    } finally {
      setAdminUnlocked(false);
      setScreen("profile");
    }
  };

  // A shared store link points each listing at /?product=<id> (see
  // app/store/[slug]/page.tsx). Without this the buyer would land on Home
  // with no idea which item they clicked. Runs once products are loaded, and
  // clears the parameter afterwards so a refresh doesn't reopen it.
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (deepLinkHandled.current || products.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get("product");
    if (!wanted) {
      deepLinkHandled.current = true;
      return;
    }
    // Same buyer-visibility rule as buyerVisibleProducts below — a shared
    // link to a listing an admin has since removed (the exact case
    // moderation exists for, e.g. a reported scam) must not still open it.
    const match = products.find(
      (p) => p.id === wanted && p.active !== false && p.moderationStatus !== "removed"
    );
    deepLinkHandled.current = true;
    if (match) setProduct(match);
    params.delete("product");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [products]);

  // The store page's "Message seller" button points at
  // /?messageSeller=<name> (see app/store/[slug]/page.tsx) — a buyer with no
  // session lands on Login first (App.jsx never renders MainApp without one)
  // and the param survives that detour, so this only needs `user` to be
  // ready, not `products`. Cleared the same way the product deep link is, so
  // a refresh doesn't reopen the thread.
  const messageDeepLinkHandled = useRef(false);
  useEffect(() => {
    if (messageDeepLinkHandled.current || !user) return;
    const params = new URLSearchParams(window.location.search);
    const wantedSeller = params.get("messageSeller");
    const wantedSellerId = params.get("messageSellerId");
    messageDeepLinkHandled.current = true;
    if (!wantedSeller) return;
    openConversationWithSeller(wantedSeller, wantedSellerId || undefined);
    params.delete("messageSeller");
    params.delete("messageSellerId");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [user]);

  // Restores whichever screen (or open seller profile) the buyer was
  // actually on before a hard refresh — a plain in-app navigation, distinct
  // from the two one-shot shared-link deep links above (?product=,
  // ?messageSeller=), which this runs after and doesn't interfere with. See
  // the sync effect right below, which is what keeps the URL matching
  // real navigation state in the first place.
  const screenRestored = useRef(false);
  useEffect(() => {
    if (screenRestored.current) return;
    screenRestored.current = true;
    const params = new URLSearchParams(window.location.search);
    const wantedSeller = params.get("seller");
    const wantedScreen = params.get("screen");
    if (wantedSeller) {
      handleViewSeller(wantedSeller);
    } else if (wantedScreen && wantedScreen !== "home") {
      go(wantedScreen, params.get("q") || undefined);
    }
  }, []);

  // Keeps the URL matching in-app navigation (screen, open product, open
  // seller, and — for browse/sellers — the active category/search term) so
  // the restore effect above has something real to read on the NEXT hard
  // refresh. Declared after every restore effect on purpose: on first
  // mount all of these effects fire in one batch in declaration order, so
  // this one always runs last, after the URL's original params have
  // already been read by the effects that needed them.
  useEffect(() => {
    const params = new URLSearchParams();
    if (screen !== "home") {
      params.set("screen", screen);
      if (screen === "browse" && browseGroup !== "all") params.set("q", browseGroup);
      if (screen === "sellers" && sellerQuery) params.set("q", sellerQuery);
    }
    if (product) params.set("product", product.id);
    else if (viewedSeller) params.set("seller", viewedSeller);

    const nextSearch = params.toString() ? `?${params.toString()}` : "";
    if (nextSearch !== window.location.search) {
      window.history.replaceState(null, "", `${window.location.pathname}${nextSearch}`);
    }
  }, [screen, product, viewedSeller, browseGroup, sellerQuery]);

  // An unlock outlives a page reload (it lives on the session row, not in
  // memory), so ask once on load rather than making the admin sign in again
  // for nothing. A non-admin never calls this.
  useEffect(() => {
    if (!isAdmin) {
      setAdminUnlocked(false);
      return;
    }
    let cancelled = false;
    api
      .getAdminSession()
      .then(({ unlocked }) => {
        if (!cancelled) setAdminUnlocked(Boolean(unlocked));
      })
      .catch(() => {
        if (!cancelled) setAdminUnlocked(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, user?.id]);

  // The unlock can age out mid-session, so the first admin call to come back
  // locked drops the flag and bounces to the staff screen — wherever that
  // call was made from, without every caller handling it itself.
  useEffect(() => {
    setAdminLockedHandler(() => {
      setAdminUnlocked(false);
      setScreen((s) => (s === "admin" ? "adminLogin" : s));
    });
    return () => setAdminLockedHandler(null);
  }, []);

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
    let cancelled = false;
    const interval = setInterval(() => {
      api
        .getMessages(activeThread.id)
        .then((messages) => {
          if (!cancelled) setThreadMessages(messages);
        })
        .catch(() => {});
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeThread?.id]);

  // Split out from handleContactSeller below so the store page's "Message
  // seller" deep link (?messageSeller=<name>) can open the same thread
  // without needing a product object — /store/[slug] only has the seller's
  // public name, never a Product.
  const openConversationWithSeller = async (sellerName, sellerId) => {
    if (!user) {
      showToast("Log in to message a seller.", "error");
      return;
    }
    try {
      const conversationId = await api.startConversation(sellerName, sellerId);
      setActiveThread({ id: conversationId, otherParty: { businessName: sellerName, name: sellerName } });
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

  const handleContactSeller = (product) => openConversationWithSeller(product.seller, product.sellerId);

  const handleReportProduct = async (productId, reason, details) => {
    if (!user) {
      throw new Error("Log in to report a listing.");
    }
    return api.reportProduct(productId, reason, details);
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
  // owning seller's own dashboard, where it's marked as hidden. Same idea
  // for a listing an admin removed for a policy violation (migration 027,
  // moderationStatus) — 'under_review' still shows (it's only a soft flag
  // for a human to look at), 'removed' doesn't.
  const buyerVisibleProducts = products.filter((p) => p.active !== false && p.moderationStatus !== "removed");
  const cartCount = cart.reduce((sum, it) => sum + it.qty, 0);

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
            role={user?.role}
            orders={orders}
            myRequests={myRequests}
            cartCount={cartCount}
          />
        )}
        {screen === "cart" && (
          <Cart
            cart={cart}
            products={buyerVisibleProducts}
            onBack={() => go("home")}
            go={go}
            onUpdateQty={handleUpdateCartQty}
            onRemove={handleRemoveFromCart}
            onCheckout={handleCartCheckout}
            checkingOut={checkingOutCart}
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
        {screen === "sellers" && (
          <SellerDirectory onBack={goBack} onViewSeller={handleViewSeller} initialQuery={sellerQuery} />
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
              onGoHome={() => go("home")}
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
              onGoHome={() => go("home")}
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
              onGoHome={() => go("home")}
              onLogout={onLogout}
              logoutLabel="Log out"
            />
          )
        )}
        {screen === "request" && (
          <RequestForm go={go} showToast={showToast} myLocation={myLocation} />
        )}
        {screen === "myRequests" && (
          <MyRequests requests={myRequests} onAcceptOffer={handleAcceptOffer} onCancelRequest={handleCancelRequest} />
        )}
        {screen === "seller" && (
          isSeller ? (
            <SellerDashboard
              requests={requests}
              onSendOffer={handleSendOffer}
              user={user}
              mySellerId={mySellerId}
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
            transactionRecords={transactionRecords}
            myStore={myStore}
            onClaimStore={handleClaimStore}
            claimingStore={claimingStore}
              onBoostProduct={handleBoostProduct}
              go={go}
            />
          ) : (
            <RoleGate
              title="Seller access needed"
              message="This dashboard belongs to seller accounts. Sign up with a seller account (or log in with one) to respond to customer requests here."
              onGoHome={() => go("home")}
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
              onLoadModerationRules={handleLoadModerationRules}
              onCreateModerationRule={handleCreateModerationRule}
              onUpdateModerationRule={handleUpdateModerationRule}
              onLoadFlaggedProducts={handleLoadFlaggedProducts}
              onModerateProduct={handleModerateProduct}
              onLoadProductReports={handleLoadProductReports}
              onResolveProductReport={handleResolveProductReport}
              onLoadRiskSignals={handleLoadRiskSignals}
              onLoadTickets={handleLoadAdminTickets}
              onLoadTicket={handleLoadAdminTicket}
              onSendTicketMessage={handleSendAdminTicketMessage}
              onResolveTicket={handleResolveTicket}
              onLoadAnalytics={handleLoadAnalytics}
              onLoadAlerts={handleLoadAlerts}
              onSendBroadcast={handleSendBroadcast}
              onLeaveAdmin={handleLeaveAdmin}
              onGrantSubscription={(payload) => api.grantSubscription(payload)}
              onLookupTransaction={(code) => api.lookupTransactionRecord(code)}
              onCorrectTransaction={(code, reason) => api.correctTransactionRecord(code, reason)}
            />
          ) : (
            <RoleGate
              title="Admin access needed"
              message="This queue is staff-only. Log in with an admin account to verify sellers and review unmatched requests."
              onGoHome={() => go("home")}
              onLogout={onLogout}
              logoutLabel="Log out"
            />
          )
        )}
        {screen === "adminLogin" && (
          isAdmin ? (
            <AdminLogin
              user={user}
              showToast={showToast}
              onBack={() => navigateTo("profile")}
              onUnlocked={() => {
                setAdminUnlocked(true);
                setScreen("admin");
              }}
            />
          ) : (
            <RoleGate
              title="Admin access needed"
              message="This queue is staff-only. Log in with an admin account to verify sellers and review unmatched requests."
              onGoHome={() => go("home")}
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
            bio={verification?.description}
            onUpdateBio={handleUpdateSellerDescription}
            savingBio={savingDescription}
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
            transactionRecords={transactionRecords}
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
            onPay={api.payForOrder}
            showToast={showToast}
            go={go}
          />
        )}
      </main>

      <AnimatePresence>
        {product && (
          <ProductDetail
            key={product.id}
            product={product}
            onClose={() => setProduct(null)}
            go={go}
            onBuyNow={buyNow}
            onAddToCart={handleAddToCart}
            onContact={handleContactSeller}
            onViewSeller={handleViewSeller}
            savedIds={savedIds}
            onToggleSaved={handleToggleSaved}
            myLocation={myLocation}
            onReportProduct={handleReportProduct}
            showToast={showToast}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewedSeller && (
          <SellerProfile
            key={viewedSeller}
            profile={viewedSellerProfile}
            loading={viewedSellerLoading}
            error={viewedSellerError}
            onBack={closeSellerProfile}
            onOpenProduct={handleOpenProductFromSeller}
            onContact={handleContactSeller}
            myLocation={myLocation}
            viewerSellerId={mySellerId}
          />
        )}
      </AnimatePresence>

      {activeThread && (
        <Thread
          conversationId={activeThread.id}
          otherParty={activeThread.otherParty}
          messages={threadMessages}
          loading={threadLoading}
          onBack={() => {
            threadRequestRef.current++;
            setActiveThread(null);
          }}
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
                className="relative w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-all"
                style={active ? { background: "linear-gradient(135deg,#FCD34D,#F59E0B)" } : {}}
              >
                <t.icon size={18} className={active ? "text-[#3B1874]" : "text-white/70"} strokeWidth={active ? 2.3 : 1.8} />
                {t.key === "admin" && adminAlertCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#E64980] text-white text-[9px] font-bold flex items-center justify-center">
                    {adminAlertCount > 9 ? "9+" : adminAlertCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
