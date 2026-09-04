"use client";

import { useEffect, useState } from "react";
import {
  Home as HomeIcon, Search, ShoppingCart, LayoutDashboard, ShieldCheck, User,
} from "lucide-react";
import { Logo, Wordmark, RoleGate } from "./shared";
import { api } from "./api";
import Home from "./Home";
import Browse from "./Browse";
import RequestForm from "./RequestForm";
import SellerDashboard from "./SellerDashboard";
import AdminQueue from "./AdminQueue";
import Profile from "./Profile";
import Account from "./Account";
import Notifications from "./Notifications";
import Checkout from "./Checkout";
import ProductDetail from "./ProductDetail";
import Messages from "./Messages";
import Thread from "./Thread";
import SellerProfile from "./SellerProfile";

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

export default function MainApp({ user, onLogout, showToast }) {
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

  useEffect(() => {
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
    if (isAdmin) {
      api.getSellers().then(setSellers).catch(() => {});
    }
  }, [user?.id]);

  const go = (s, group) => {
    setScreen(s);
    if (s === "browse") setBrowseGroup(group || "all"); // always reset unless a category was explicitly passed
    setProduct(null); // close any open product detail overlay when navigating
    setViewedSeller(null);
    window.scrollTo?.(0, 0);
    if ((s === "seller" || s === "admin") && (isSeller || isAdmin)) {
      api.getOpenRequests().then(setRequests).catch(() => {});
    }
    if (s === "messages" && user) {
      api.getConversations().then(setConversations).catch(() => {});
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

  const handleOrderCreated = (order) => {
    setOrders((os) => [order, ...os]);
    if (isSeller || isAdmin) {
      api.getOpenRequests().then(setRequests).catch(() => {});
    }
  };

  const buyNow = async (prod, qty, condition) => {
    try {
      const order = await api.createOrder({
        item: prod.name,
        seller: prod.seller,
        price: prod.price * qty,
        status: "Awaiting payment",
      });
      setOrders((os) => [order, ...os]);
      setCheckoutOrder({ product: prod, qty, condition });
      setProduct(null);
      setScreen("checkout");
      window.scrollTo?.(0, 0);
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

  const handleCreateProduct = async (input) => {
    try {
      const product = await api.createProduct(input);
      setProducts((ps) => [product, ...ps]);
      showToast("Listing added.");
    } catch (err) {
      showToast(err.message || "Couldn't add that listing — try again.", "error");
      throw err;
    }
  };

  const handleUpdateProduct = async (id, patch) => {
    try {
      const product = await api.updateProduct(id, patch);
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

  const handleSellerStatusChange = async (id, status) => {
    const seller = sellers.find((s) => s.id === id);
    setSellers((ss) => ss.map((s) => (s.id === id ? { ...s, status } : s)));
    try {
      await api.setSellerStatus(id, status);
      showToast(`${seller?.name || "Seller"} ${status}.`);
    } catch (err) {
      setSellers((ss) => ss.map((s) => (s.id === id ? { ...s, status: seller.status } : s)));
      showToast(err.message || "Couldn't update that seller — try again.", "error");
    }
  };

  const handleSendOffer = async (requestId) => {
    try {
      await api.sendSellerOffer(requestId);
      setRequests(await api.getOpenRequests());
      showToast("Offer sent to the customer.");
    } catch (err) {
      showToast(err.message || "Couldn't send that offer — try again.", "error");
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

  return (
    <div className="min-h-screen bg-[#FAFAFF]" style={{ fontFamily: "'Work Sans', sans-serif" }}>
      {screen !== "home" && (
        <header className="sticky top-0 z-30 bg-[#FAFAFF]/95 backdrop-blur border-b border-[#ECE9F7] px-5 py-3 flex items-center justify-between">
          <button onClick={() => go("home")} className="flex items-center gap-2">
            <Logo size={26} />
            <Wordmark />
          </button>
        </header>
      )}

      <main className="pb-24">
        {screen === "home" && (
          <Home go={go} openProduct={setProduct} products={products} unreadCount={notifications.filter((n) => n.unread).length} />
        )}
        {screen === "browse" && <Browse initialGroup={browseGroup} openProduct={setProduct} products={products} />}
        {screen === "request" && <RequestForm go={go} onOrderCreated={handleOrderCreated} />}
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
            />
          ) : (
            <RoleGate
              title="Seller access needed"
              message="This dashboard belongs to seller accounts. Sign up with a seller account (or log in with one) to respond to customer requests here."
              onLogout={onLogout}
              logoutLabel={user ? "Log out" : "Log in"}
            />
          )
        )}
        {screen === "admin" && (
          isAdmin ? (
            <AdminQueue sellers={sellers} requests={requests} onSellerStatusChange={handleSellerStatusChange} />
          ) : (
            <RoleGate
              title="Admin access needed"
              message="This queue is staff-only. Log in with an admin account to verify sellers and review unmatched requests."
              onLogout={onLogout}
              logoutLabel={user ? "Log out" : "Log in"}
            />
          )
        )}
        {screen === "profile" && (
          <Profile go={go} user={user} onLogout={onLogout} unreadCount={notifications.filter((n) => n.unread).length} />
        )}
        {screen === "messages" && (
          user ? (
            <Messages conversations={conversations} onOpenThread={handleOpenThread} />
          ) : (
            <RoleGate
              title="Log in to message sellers"
              message="Create an account or log in to start a conversation with a seller."
              onLogout={onLogout}
              logoutLabel="Log in"
            />
          )
        )}
        {screen === "account" && (
          <Account openProduct={setProduct} orders={orders} products={products} onReview={handleReview} />
        )}
        {screen === "notifications" && (
          <Notifications
            notifications={notifications}
            onMarkRead={handleMarkNotificationRead}
            onMarkAllRead={handleMarkAllRead}
          />
        )}
        {screen === "checkout" && checkoutOrder && (
          <Checkout product={checkoutOrder.product} qty={checkoutOrder.qty} condition={checkoutOrder.condition} go={go} />
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
        />
      )}

      {viewedSeller && (
        <SellerProfile
          sellerName={viewedSeller}
          products={products}
          onBack={() => setViewedSeller(null)}
          onOpenProduct={handleOpenProductFromSeller}
          onContact={handleContactSeller}
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

      <nav className="fixed bottom-0 left-0 right-0 z-30 px-6 pb-6 pt-2 flex justify-center">
        <div
          className="flex items-center gap-1 rounded-full shadow-2xl px-3 py-2.5"
          style={{ background: "linear-gradient(135deg,#1E1B4B,#3B1874)" }}
        >
          {TABS.map((t) => {
            const activeKey = ["account", "notifications"].includes(screen) ? "profile" : screen;
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
