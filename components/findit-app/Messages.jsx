"use client";

import { MessageCircle, ChevronRight } from "lucide-react";

function timeAgoShort(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

export default function Messages({ conversations, onOpenThread }) {
  return (
    <div className="px-5 pt-6 pb-10">
      <h1 className="text-[19px] font-bold text-[#1E1B4B] mb-1" style={{ fontFamily: "Fraunces, serif" }}>Messages</h1>
      <p className="text-[12px] text-[#6B6483] mb-5">Conversations with sellers on FindIt.</p>

      {conversations.length === 0 && (
        <p className="text-[12px] text-[#6B6483]">
          No conversations yet — tap "Contact" on a product to message its seller.
        </p>
      )}

      <div className="space-y-2.5">
        {conversations.map((c) => {
          const displayName = c.otherParty.businessName || c.otherParty.name;
          return (
            <button
              key={c.id}
              onClick={() => onOpenThread(c.id, c.otherParty)}
              className={`w-full flex items-center gap-3 rounded-[20px] p-3.5 text-left border ${c.unreadCount > 0 ? "bg-[#F5F2FC] border-[#E4D9FA]" : "bg-white border-[#ECE9F7]"}`}
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white text-[14px] font-bold" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}>
                {displayName?.[0]?.toUpperCase() || <MessageCircle size={16} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-[#1E1B4B] truncate">{displayName}</p>
                <p className="text-[11.5px] text-[#6B6483] truncate">{c.lastMessage || "Say hello…"}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-[10px] text-[#8A8372]">{timeAgoShort(c.lastMessageAt)}</span>
                {c.unreadCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-[#F59E0B] text-white text-[9px] font-bold flex items-center justify-center">{c.unreadCount}</span>
                )}
                {c.unreadCount === 0 && <ChevronRight size={14} className="text-[#B7AFD6]" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
