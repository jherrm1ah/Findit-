"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, Send } from "lucide-react";
import { IconButton } from "./sharedMotion";
import { DURATION, EASE, press } from "./motion";

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });
}

// The `interactive-widget=resizes-content` viewport meta tag (set in
// app/layout.tsx) is the standards-track fix for the on-screen keyboard
// covering a `fixed` bottom bar, but it's a newer directive — plenty of
// real Android browsers still ignore it and leave the layout viewport at
// its original height, so a `fixed inset-0` panel keeps its full height
// and the keyboard simply overlaps its bottom edge (the message input,
// here). `visualViewport` is the older, far more broadly supported API for
// the same problem: it reports the actual visible area, shrinking live as
// the keyboard opens. Tracking it directly and sizing this panel to match
// works even on browsers that never adopted the meta tag.
function useVisualViewportHeight() {
  const [height, setHeight] = useState(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setHeight(vv.height);
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return height;
}

export default function Thread({ conversationId, otherParty, messages, onBack, onSend, loading }) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const displayName = otherParty?.businessName || otherParty?.name || "Seller";
  const viewportHeight = useVisualViewportHeight();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const submit = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await onSend(conversationId, body);
      setDraft("");
    } catch {
      // onSend already surfaced a toast — keep the draft so nothing typed is lost.
    } finally {
      setSending(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: DURATION.base, ease: EASE }}
      className="fixed top-0 left-0 right-0 bg-[#FAFAFF] z-40 flex flex-col"
      style={{ height: viewportHeight != null ? viewportHeight : "100dvh" }}
    >
      <div className="sticky top-0 z-10 bg-[#FAFAFF]/95 backdrop-blur border-b border-[#ECE9F7] px-5 pt-4 pb-3 flex items-center gap-3 shrink-0">
        <IconButton onClick={onBack} aria-label="Back"><ChevronLeft size={18} className="text-[#1E1B4B]" /></IconButton>
        <p className="text-[15px] font-bold text-[#1E1B4B]">{displayName}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {loading && <p className="text-[12px] text-[#6B6483] text-center">Loading…</p>}
        {!loading && messages.length === 0 && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.base, ease: EASE }}
            className="text-[12px] text-[#6B6483] text-center mt-6"
          >
            This is the start of your conversation with {displayName}.
          </motion.p>
        )}
        {/* initial={false} — the existing history shouldn't cascade in every
            time this screen mounts or a poll tick refetches the same
            messages; keyed by m.id, only a genuinely new message (sent or
            received) is a fresh mount and gets the slide-in below. */}
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              layout="position"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: DURATION.fast, ease: EASE }}
              className={`flex ${m.mine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 ${m.mine ? "text-white" : "bg-white border border-[#ECE9F7] text-[#1E1B4B]"}`}
                style={m.mine ? { background: "linear-gradient(135deg,#A855F7,#7C3AED)" } : {}}
              >
                <p className="text-[13px] leading-relaxed">{m.body}</p>
                <p className={`text-[10px] mt-1 ${m.mine ? "text-white/70" : "text-[#8A8372]"}`}>{formatTime(m.createdAt)}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      <form onSubmit={submit} className="shrink-0 bg-white border-t border-[#ECE9F7] px-4 py-3 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          maxLength={2000}
          className="flex-1 bg-[#F5F2FC] rounded-full px-4 py-2.5 text-[13px] outline-none text-[#1E1B4B] placeholder:text-[#8A8372]"
        />
        <motion.button
          type="submit"
          disabled={!draft.trim() || sending}
          {...press}
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${!draft.trim() || sending ? "opacity-50" : ""}`}
          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
        >
          <Send size={15} className="text-white" />
        </motion.button>
      </form>
    </motion.div>
  );
}
