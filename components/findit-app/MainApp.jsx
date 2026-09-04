"use client";

import { useEffect, useState } from "react";
import {
  Home as HomeIcon, Search, ShoppingCart, MessageCircle, User,
} from "lucide-react";
import { Logo, Wordmark } from "./shared";
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

const TABS = [
  { key: "home", label: "Home", icon: HomeIcon },
  { key: "browse", label: "Search", icon: Search },
  { key: "request", label: "Request", icon: ShoppingCart },
  { key: "seller", label: "Messages", icon: MessageCircle },
  { key: "profile", label: "Profile", icon: User },
];

export default function MainApp() {
  const [screen, setScreen] = useState("home");
  const [browseGroup, setBrowseGroup] = useState("all");
  const [product, setProduct] = useState(null);
  const [checkoutOrder, setCheckoutOrder] = useState(null);

  const [loaded, setLoaded] = useState(false);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    Promise.all([
      api.getProducts(),
      api.getOrders(),
      api.getNotifications(),
      api.getSellers(),
      api.getOpenRequests(),
    ])
      .then(([p, o, n, s, r]) => {
        setProducts(p);
        setOrders(o);
        setNotifications(n);
        setSellers(s);
        setRequests(r);
      })
      .finally(() => setLoaded(true));
  }, []);

  const go = (s, group) => {
    setScreen(s);
    if (s === "browse") setBrowseGroup(group || "all"); // always reset unless a category was explicitly passed
    setProduct(null); // close any open product detail overlay when navigating
    window.scrollTo?.(0, 0);
    if (s === "seller" || s === "admin") {
      api.getOpenRequests().then(setRequests).catch(() => {});
    }
  };

  const handleOrderCreated = (order) => {
    setOrders((os) => [order, ...os]);
    api.getOpenRequests().then(setRequests).catch(() => {});
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
      alert(err.message || "Couldn't place that order — try again.");
    }
  };

  const handleReview = async (orderId, rating, comment) => {
    const order = await api.submitOrderReview(orderId, { rating, comment: comment || null });
    setOrders((os) => os.map((o) => (o.id === orderId ? order : o)));
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
    setSellers((ss) => ss.map((s) => (s.id === id ? { ...s, status } : s)));
    try {
      await api.setSellerStatus(id, status);
    } catch {
      // best-effort
    }
  };

  const handleSendOffer = async (requestId) => {
    try {
      await api.sendSellerOffer(requestId);
      setRequests(await api.getOpenRequests());
    } catch (err) {
      alert(err.message || "Couldn't send that offer — try again.");
    }
  };

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFF]">
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
          <span className="text-[10px] text-[#8A8372] font-mono">PROTOTYPE</span>
        </header>
      )}

      <main className="pb-24">
        {screen === "home" && <Home go={go} openProduct={setProduct} products={products} />}
        {screen === "browse" && <Browse initialGroup={browseGroup} openProduct={setProduct} products={products} />}
        {screen === "request" && <RequestForm go={go} onOrderCreated={handleOrderCreated} />}
        {screen === "seller" && <SellerDashboard requests={requests} onSendOffer={handleSendOffer} />}
        {screen === "admin" && (
          <AdminQueue sellers={sellers} requests={requests} onSellerStatusChange={handleSellerStatusChange} />
        )}
        {screen === "profile" && <Profile go={go} />}
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

      {product && <ProductDetail product={product} onClose={() => setProduct(null)} go={go} onBuyNow={buyNow} />}

      <nav className="fixed bottom-0 left-0 right-0 z-30 px-6 pb-6 pt-2 flex justify-center">
        <div
          className="flex items-center gap-1 rounded-full shadow-2xl px-3 py-2.5"
          style={{ background: "linear-gradient(135deg,#1E1B4B,#3B1874)" }}
        >
          {TABS.map((t) => {
            const activeKey = ["admin", "account", "notifications"].includes(screen) ? "profile" : screen;
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
