"use client";

import { useState } from "react";
import {
  Home as HomeIcon, Search, ShoppingCart, MessageCircle, User,
} from "lucide-react";
import { MY_ORDERS_SEED } from "./data";
import { Logo, Wordmark } from "./shared";
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
  const [orders, setOrders] = useState(MY_ORDERS_SEED);
  const [checkoutOrder, setCheckoutOrder] = useState(null);

  const go = (s, group) => {
    setScreen(s);
    if (s === "browse") setBrowseGroup(group || "all"); // always reset unless a category was explicitly passed
    setProduct(null); // close any open product detail overlay when navigating
    window.scrollTo?.(0, 0);
  };

  const addOrder = (partial) => {
    const newOrder = { id: "ORD-" + Math.floor(1000 + Math.random() * 9000), date: "Today", ...partial };
    setOrders((os) => [newOrder, ...os]);
    return newOrder;
  };

  const buyNow = (prod, qty, condition) => {
    addOrder({ item: prod.name, seller: prod.seller, price: prod.price * qty, status: "Awaiting payment", canReview: false, reviewed: false });
    setCheckoutOrder({ product: prod, qty, condition });
    setProduct(null);
    setScreen("checkout");
    window.scrollTo?.(0, 0);
  };

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
        {screen === "home" && <Home go={go} openProduct={setProduct} />}
        {screen === "browse" && <Browse initialGroup={browseGroup} openProduct={setProduct} />}
        {screen === "request" && <RequestForm go={go} addOrder={addOrder} />}
        {screen === "seller" && <SellerDashboard />}
        {screen === "admin" && <AdminQueue />}
        {screen === "profile" && <Profile go={go} />}
        {screen === "account" && <Account go={go} openProduct={setProduct} orders={orders} setOrders={setOrders} />}
        {screen === "notifications" && <Notifications />}
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
