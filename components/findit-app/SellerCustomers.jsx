"use client";

import { MessageCircle, Phone, Users } from "lucide-react";
import { naira } from "./data";
import { customersFromOrders } from "@/lib/sellerCustomers";

// Customers: the people who've paid for something from this seller, most
// recent first, with what they bought and a way to reach them. Built from the
// seller's own paid orders, so it shows nothing a seller couldn't already see
// on those orders.
export default function SellerCustomers({ orders, onMessage, messagingId }) {
  const customers = customersFromOrders(orders);

  if (customers.length === 0) {
    return (
      <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-5 text-center">
        <div className="w-11 h-11 rounded-full bg-[#F5F2FC] flex items-center justify-center mx-auto mb-3">
          <Users size={18} className="text-[#7C3AED]" />
        </div>
        <p className="text-[13px] font-semibold text-[#1E1B4B] mb-1">No customers yet</p>
        <p className="text-[12px] text-[#6B6483]">Everyone who pays for an order from you will be listed here.</p>
      </div>
    );
  }

  return (
    <>
      <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3">
        Customers · {customers.length}
      </p>
      <div className="space-y-3 mb-7">
        {customers.map((c) => (
          <div key={c.userId} className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 shadow-sm shadow-[#4C1D95]/5">
            <div className="flex items-start justify-between gap-3 mb-1">
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-[#1E1B4B] truncate">{c.name ?? "Customer"}</p>
                <p className="text-[11px] text-[#6B6483]">
                  {c.orderCount} order{c.orderCount === 1 ? "" : "s"} · last on{" "}
                  {new Date(c.lastOrderAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
              <p className="text-[14px] font-bold text-[#7C3AED] shrink-0">{naira(c.totalSpent)}</p>
            </div>
            <p className="text-[11.5px] text-[#514B67] mb-2.5 line-clamp-2">{c.items.join(", ")}</p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => onMessage(c.latestOrder)}
                disabled={messagingId !== null}
                className={`flex items-center gap-1.5 text-[12px] font-semibold text-[#7C3AED] ${messagingId !== null ? "opacity-60" : ""}`}
              >
                <MessageCircle size={13} /> {messagingId === c.latestOrder.id ? "Opening…" : "Message"}
              </button>
              {c.phone && (
                <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#7C3AED]">
                  <Phone size={13} /> Call
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
