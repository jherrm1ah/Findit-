"use client";

import { useRef, useState } from "react";
import { ShieldCheck, ListOrdered, Bell, LayoutDashboard, User, ChevronRight, LogOut, MessageCircle, PackageSearch, Camera, Clock, CheckCircle2, XCircle } from "lucide-react";
import { Pill } from "./shared";

const SELLER_STATUS_META = {
  pending: { label: "Pending review", tone: "gold", icon: Clock },
  approved: { label: "Verified seller", tone: "green", icon: CheckCircle2 },
  rejected: { label: "Application rejected", tone: "red", icon: XCircle },
};

export default function Profile({ go, user, onLogout, unreadCount = 0, onUploadAvatar, sellerStatus }) {
  const fileInputRef = useRef(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const sellerStatusMeta = user.role === "seller" ? SELLER_STATUS_META[sellerStatus] : null;

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again later
    if (!file || !onUploadAvatar) return;
    setUploadingAvatar(true);
    try {
      await onUploadAvatar(file);
    } catch {
      // MainApp already surfaced a toast
    } finally {
      setUploadingAvatar(false);
    }
  };

  const CARDS = [
    {
      key: "admin",
      icon: ShieldCheck,
      label: "Admin queue",
      subtitle: user.role === "admin" ? "Seller verification & unmatched requests" : "Staff only",
      primary: user.role === "admin",
    },
    { key: "account", icon: ListOrdered, label: "My orders & saved items", subtitle: "Track deliveries, leave reviews" },
    { key: "myRequests", icon: PackageSearch, label: "My requests", subtitle: "See offers from real sellers" },
    { key: "messages", icon: MessageCircle, label: "Messages", subtitle: "Chat with sellers" },
    { key: "notifications", icon: Bell, label: "Notifications", subtitle: unreadCount > 0 ? `${unreadCount} unread` : "Order updates & offers" },
    {
      key: "seller",
      icon: LayoutDashboard,
      label: "Seller dashboard",
      subtitle:
        user.role === "seller"
          ? sellerStatus === "pending" || sellerStatus === "rejected"
            ? sellerStatusMeta.label
            : user.businessName
          : "Requires a seller account",
    },
  ];
  const SETTINGS_ROWS = [
    { key: "accountDetails", label: "Account details" },
    { key: "notifPrefs", label: "Notification preferences" },
    { key: "help", label: "Help & support" },
    { key: "about", label: "About FindIt" },
  ];

  return (
    <div className="px-5 pt-6 pb-10">
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingAvatar}
          aria-label="Change profile photo"
          className="w-14 h-14 rounded-full flex items-center justify-center shrink-0 overflow-hidden relative"
          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
        >
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <User size={24} className="text-white" />
          )}
          <span className="absolute inset-0 bg-black/30 flex items-center justify-center">
            {uploadingAvatar ? (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <Camera size={14} className="text-white" />
            )}
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleAvatarChange}
          className="hidden"
        />
        <div className="flex-1 min-w-0">
          <p className="text-[16px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>
            {user.name}
          </p>
          <p className="text-[12px] text-[#6B6483]">
            {user.phone} · {user.role === "seller" ? "Seller account" : "Buyer account"}
          </p>
          {sellerStatusMeta && (
            <div className="mt-1.5">
              <Pill tone={sellerStatusMeta.tone}>
                <sellerStatusMeta.icon size={11} />
                {sellerStatusMeta.label}
              </Pill>
            </div>
          )}
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-[#7C3AED] px-3 py-2 rounded-full border border-[#ECE9F7] shrink-0"
        >
          <LogOut size={12} /> Log out
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
        {SETTINGS_ROWS.map((row, i) => (
          <button
            key={row.key}
            onClick={() => go(row.key)}
            className={`w-full flex items-center justify-between px-4 py-3.5 text-left ${i !== SETTINGS_ROWS.length - 1 ? "border-b border-[#ECE9F7]" : ""}`}
          >
            <p className="text-[13px] text-[#1E1B4B]">{row.label}</p>
            <ChevronRight size={15} className="text-[#B7AFD6]" />
          </button>
        ))}
      </div>
    </div>
  );
}
