"use client";

import { useState } from "react";
import { NOTIFICATIONS } from "./data";

export default function Notifications() {
  const [items, setItems] = useState(NOTIFICATIONS);
  const markAllRead = () => setItems((its) => its.map((n) => ({ ...n, unread: false })));
  const unreadCount = items.filter((n) => n.unread).length;

  return (
    <div className="px-5 pt-6 pb-10">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-[19px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>Notifications</h1>
        {unreadCount > 0 && <button onClick={markAllRead} className="text-[12px] text-[#7C3AED] font-medium">Mark all read</button>}
      </div>
      <p className="text-[12px] text-[#6B6483] mb-5">Order updates, offers, and account activity.</p>
      <div className="space-y-2.5">
        {items.map((n) => (
          <button
            key={n.id}
            onClick={() => setItems((its) => its.map((i) => (i.id === n.id ? { ...i, unread: false } : i)))}
            className={`w-full flex items-start gap-3 rounded-[20px] p-3.5 text-left border ${n.unread ? "bg-[#F5F2FC] border-[#E4D9FA]" : "bg-white border-[#ECE9F7]"}`}
          >
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: n.unread ? "linear-gradient(135deg,#A855F7,#7C3AED)" : "#F5F2FC" }}>
              <n.icon size={15} className={n.unread ? "text-white" : "text-[#7C3AED]"} />
            </div>
            <div className="flex-1">
              <p className="text-[12.5px] font-semibold text-[#1E1B4B]">{n.title}</p>
              <p className="text-[11.5px] text-[#6B6483]">{n.body}</p>
              <p className="text-[10px] text-[#8A8372] mt-1">{n.time}</p>
            </div>
            {n.unread && <span className="w-2 h-2 rounded-full bg-[#F59E0B] mt-1.5 shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  );
}
