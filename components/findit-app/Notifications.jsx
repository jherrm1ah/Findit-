"use client";

import { motion, AnimatePresence } from "motion/react";
import { Bell } from "lucide-react";
import { NOTIFICATION_ICONS } from "./data";
import { DURATION, EASE, STAGGER_CONTAINER, STAGGER_ITEM } from "./motion";

export default function Notifications({ notifications, onMarkRead, onMarkAllRead }) {
  const unreadCount = notifications.filter((n) => n.unread).length;

  return (
    <div className="px-5 pt-6 pb-10">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-[19px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>Notifications</h1>
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.fast }}
              onClick={onMarkAllRead}
              className="text-[12px] text-[#7C3AED] font-medium"
            >
              Mark all read
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      <p className="text-[12px] text-[#6B6483] mb-5">Order updates, offers, and account activity.</p>
      <motion.div className="space-y-2.5" initial="hidden" animate="visible" variants={STAGGER_CONTAINER}>
        {notifications.map((n) => {
          // Falls back to Bell rather than crashing the whole screen on a
          // notification type this map doesn't know yet — see the map's own
          // comment in data.js for the two real cases this already hit.
          const Icon = NOTIFICATION_ICONS[n.type] || Bell;
          return (
            <motion.button
              key={n.id}
              layout="position"
              variants={STAGGER_ITEM}
              onClick={() => onMarkRead(n.id)}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: DURATION.instant }}
              className={`w-full flex items-start gap-3 rounded-[20px] p-3.5 text-left border transition-colors duration-200 ${n.unread ? "bg-[#F5F2FC] border-[#E4D9FA]" : "bg-white border-[#ECE9F7]"}`}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors duration-200"
                style={{ background: n.unread ? "linear-gradient(135deg,#A855F7,#7C3AED)" : "#F5F2FC" }}
              >
                <Icon size={15} className={`transition-colors duration-200 ${n.unread ? "text-white" : "text-[#7C3AED]"}`} />
              </div>
              <div className="flex-1">
                <p className="text-[12.5px] font-semibold text-[#1E1B4B]">{n.title}</p>
                <p className="text-[11.5px] text-[#6B6483]">{n.body}</p>
                <p className="text-[10px] text-[#8A8372] mt-1">{n.time}</p>
              </div>
              <AnimatePresence>
                {n.unread && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.4 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.4 }}
                    transition={{ duration: DURATION.fast, ease: EASE }}
                    className="w-2 h-2 rounded-full bg-[#F59E0B] mt-1.5 shrink-0"
                  />
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </motion.div>
    </div>
  );
}
