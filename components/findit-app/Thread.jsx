"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Send } from "lucide-react";
import { IconButton } from "./shared";

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });
}

export default function Thread({ conversationId, otherParty, messages, onBack, onSend, loading }) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const displayName = otherParty?.businessName || otherParty?.name || "Seller";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const submit = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft("");
    try {
      await onSend(conversationId, body);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#FAFAFF] z-40 flex flex-col">
      <div className="sticky top-0 z-10 bg-[#FAFAFF]/95 backdrop-blur border-b border-[#ECE9F7] px-5 pt-4 pb-3 flex items-center gap-3 shrink-0">
        <IconButton onClick={onBack} aria-label="Back"><ChevronLeft size={18} className="text-[#1E1B4B]" /></IconButton>
        <p className="text-[15px] font-bold text-[#1E1B4B]">{displayName}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {loading && <p className="text-[12px] text-[#6B6483] text-center">Loading…</p>}
        {!loading && messages.length === 0 && (
          <p className="text-[12px] text-[#6B6483] text-center mt-6">
            This is the start of your conversation with {displayName}.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 ${m.mine ? "text-white" : "bg-white border border-[#ECE9F7] text-[#1E1B4B]"}`}
              style={m.mine ? { background: "linear-gradient(135deg,#A855F7,#7C3AED)" } : {}}
            >
              <p className="text-[13px] leading-relaxed">{m.body}</p>
              <p className={`text-[10px] mt-1 ${m.mine ? "text-white/70" : "text-[#8A8372]"}`}>{formatTime(m.createdAt)}</p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={submit} className="shrink-0 bg-white border-t border-[#ECE9F7] px-4 py-3 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 bg-[#F5F2FC] rounded-full px-4 py-2.5 text-[13px] outline-none text-[#1E1B4B] placeholder:text-[#8A8372]"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${!draft.trim() || sending ? "opacity-50" : ""}`}
          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
        >
          <Send size={15} className="text-white" />
        </button>
      </form>
    </div>
  );
}
