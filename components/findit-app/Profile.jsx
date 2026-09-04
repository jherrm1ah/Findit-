"use client";

import { ShieldCheck, ListOrdered, Bell, LayoutDashboard, User, ChevronRight, LogOut, LogIn } from "lucide-react";

export default function Profile({ go, user, onLogout, unreadCount = 0 }) {
  const CARDS = [
    {
      key: "admin",
      icon: ShieldCheck,
      label: "Admin queue",
      subtitle: user?.role === "admin" ? "Seller verification & unmatched requests" : "Staff only",
      primary: user?.role === "admin",
    },
    { key: "account", icon: ListOrdered, label: "My orders & saved items", subtitle: "Track deliveries, leave reviews" },
    { key: "notifications", icon: Bell, label: "Notifications", subtitle: unreadCount > 0 ? `${unreadCount} unread` : "Order updates & offers" },
    {
      key: "seller",
      icon: LayoutDashboard,
      label: "Seller dashboard",
      subtitle: user?.role === "seller" ? `${user.businessName} · Jos` : "Requires a seller account",
    },
  ];
  const SETTINGS_ROWS = ["Account details", "Notification preferences", "Help & support", "About this prototype"];

  return (
    <div className="px-5 pt-6 pb-10">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}>
          <User size={24} className="text-white" />
        </div>
        <div className="flex-1">
          <p className="text-[16px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>
            {user ? user.name : "Browsing as guest"}
          </p>
          <p className="text-[12px] text-[#6B6483]">
            {user ? `${user.phone} · ${user.role === "seller" ? "Seller account" : "Buyer account"}` : "Log in to save requests and track orders"}
          </p>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-[#7C3AED] px-3 py-2 rounded-full border border-[#ECE9F7] shrink-0"
        >
          {user ? <><LogOut size={12} /> Log out</> : <><LogIn size={12} /> Log in</>}
        </button>
      </div>

      <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3">Management</p>
      <div className="space-y-3 mb-7">
        {CARDS.map((c) => (
          <button
            key={c.key}
            onClick={() => go(c.key)}
            className={`w-full flex items-center gap-3 rounded-[20px] p-4 text-left border ${c.primary ? "border-transparent text-white" : "bg-white border-[#ECE9F7]"}`}
            style={c.primary ? { background: "linear-gradient(135deg,#A855F7,#7C3AED)" } : {}}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${c.primary ? "bg-white/20" : "bg-[#F5F2FC]"}`}>
              <c.icon size={17} className={c.primary ? "text-white" : "text-[#7C3AED]"} />
            </div>
            <div className="flex-1">
              <p className={`text-[13px] font-semibold ${c.primary ? "text-white" : "text-[#1E1B4B]"}`}>{c.label}</p>
              <p className={`text-[11px] ${c.primary ? "text-white/80" : "text-[#6B6483]"}`}>{c.subtitle}</p>
            </div>
            <ChevronRight size={16} className={c.primary ? "text-white/80" : "text-[#8A8372]"} />
          </button>
        ))}
      </div>

      <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3">Settings</p>
      <div className="bg-white border border-[#ECE9F7] rounded-[20px] overflow-hidden">
        {SETTINGS_ROWS.map((label, i) => (
          <div key={label} className={`flex items-center justify-between px-4 py-3.5 ${i !== SETTINGS_ROWS.length - 1 ? "border-b border-[#ECE9F7]" : ""}`}>
            <p className="text-[13px] text-[#1E1B4B]">{label}</p>
            <ChevronRight size={15} className="text-[#B7AFD6]" />
          </div>
        ))}
      </div>
    </div>
  );
}
