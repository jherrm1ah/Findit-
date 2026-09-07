"use client";

import { useState } from "react";
import { ClipboardList, Clock, CheckCircle2, X, AlertTriangle, ShieldCheck, MessageSquareText, UserPlus } from "lucide-react";
import { Pill } from "./shared";

function describeAction(a) {
  if (a.action === "seller.approved") return `Approved seller "${a.detail?.sellerName ?? a.targetId}"`;
  if (a.action === "seller.rejected") return `Rejected seller "${a.detail?.sellerName ?? a.targetId}"`;
  if (a.action === "user.promoted_admin") return `Made "${a.detail?.name ?? a.targetId}" an admin`;
  return `${a.action} (${a.targetType} ${a.targetId})`;
}

function TeamAccess({ onLookupUser, onPromoteToAdmin, showToast }) {
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState(undefined); // undefined = not searched, null = not found, user = found
  const [looking, setLooking] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [error, setError] = useState(null);

  const findAccount = async () => {
    if (phone.trim().length < 8 || looking) return;
    setLooking(true);
    setError(null);
    setResult(undefined);
    try {
      setResult((await onLookupUser(phone.trim())) ?? null);
    } catch (err) {
      setError(err.message || "Couldn't look that up — try again.");
    } finally {
      setLooking(false);
    }
  };

  const promote = async () => {
    if (!result || promoting) return;
    setPromoting(true);
    setError(null);
    try {
      const updated = await onPromoteToAdmin(phone.trim());
      setResult(updated);
      showToast?.(`${updated.name} is now an admin.`, "success");
    } catch (err) {
      setError(err.message || "Couldn't promote that account.");
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-4">
      <div className="flex gap-2">
        <input
          type="tel"
          value={phone}
          onChange={(e) => { setPhone(e.target.value); setResult(undefined); setError(null); }}
          placeholder="Teammate's phone number"
          className="flex-1 min-w-0 border border-[#ECE9F7] rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-[#7C3AED]"
        />
        <button
          onClick={findAccount}
          disabled={phone.trim().length < 8 || looking}
          className="text-[12.5px] font-semibold text-white px-4 rounded-xl disabled:opacity-40 shrink-0"
          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
        >
          {looking ? "Searching…" : "Find account"}
        </button>
      </div>

      {error && <p className="text-[12px] text-[#E64980] mt-2">{error}</p>}

      {result === null && (
        <p className="text-[12px] text-[#6B6483] mt-2">
          No FindIt account with that phone number yet — they need to sign up first.
        </p>
      )}

      {result && (
        <div className="flex items-center justify-between mt-3 bg-[#F5F2FC] rounded-xl px-3 py-2.5">
          <div>
            <p className="text-[13px] font-semibold text-[#1E1B4B]">{result.name}</p>
            <p className="text-[11px] text-[#6B6483]">
              {result.role === "admin" ? "Already an admin" : result.role === "seller" ? "Seller account" : "Buyer account"}
            </p>
          </div>
          {result.role === "admin" ? (
            <ShieldCheck size={16} className="text-[#7C3AED] shrink-0" />
          ) : (
            <button
              onClick={promote}
              disabled={promoting}
              className="text-[12px] font-semibold text-white px-3.5 py-2 rounded-full disabled:opacity-40 shrink-0"
              style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
            >
              {promoting ? "Promoting…" : "Promote to admin"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminQueue({
  sellers,
  requests,
  onSellerStatusChange,
  adminActions = [],
  otpStats = null,
  onLookupUser,
  onPromoteToAdmin,
  showToast,
}) {
  const unmatched = requests.filter((r) => r.offerCount === 0);

  return (
    <div className="px-5 pt-6 pb-10">
      <div className="flex items-center gap-2 mb-5">
        <ClipboardList size={17} className="text-[#7C3AED]" />
        <h1 className="text-[19px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>Admin queue</h1>
      </div>

      <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3">Seller verification</p>
      <div className="space-y-3 mb-7">
        {sellers.map((s) => (
          <div key={s.id} className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 shadow-sm shadow-[#4C1D95]/5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[13px] font-semibold text-[#1E1B4B]">{s.name}</p>
              {s.status === "pending" && <Pill tone="gold"><Clock size={11} /> Pending</Pill>}
              {s.status === "approved" && <Pill tone="green"><CheckCircle2 size={11} /> Approved</Pill>}
              {s.status === "rejected" && <Pill tone="red"><X size={11} /> Rejected</Pill>}
            </div>
            <p className="text-[11px] text-[#6B6483] mb-3">{s.phone || "No phone on file"} · Applied {new Date(s.createdAt).toLocaleDateString("en-NG")}</p>
            {s.status === "pending" && (
              <div className="flex gap-2">
                <button onClick={() => onSellerStatusChange(s.id, "approved")} className="flex-1 text-white text-[12px] font-semibold py-2 rounded-xl" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}>Approve</button>
                <button onClick={() => onSellerStatusChange(s.id, "rejected")} className="flex-1 bg-white border border-[#ECE9F7] text-[#E64980] text-[12px] font-semibold py-2 rounded-xl">Reject</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3">Unmatched requests</p>
      <div className="space-y-3">
        {unmatched.length === 0 && (
          <p className="text-[12px] text-[#6B6483]">Every open request has at least one offer.</p>
        )}
        {unmatched.map((r) => (
          <div key={r.id} className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 flex items-start gap-3 shadow-sm shadow-[#4C1D95]/5">
            <AlertTriangle size={15} className="text-[#F59E0B] mt-0.5 shrink-0" />
            <div>
              <p className="text-[13px] font-semibold text-[#1E1B4B]">{r.title}</p>
              <p className="text-[11px] text-[#6B6483]">{r.posted}, no match yet</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3 mt-7 flex items-center gap-1.5">
        <UserPlus size={13} className="text-[#7C3AED]" /> Team & admin access
      </p>
      <TeamAccess onLookupUser={onLookupUser} onPromoteToAdmin={onPromoteToAdmin} showToast={showToast} />

      {otpStats && (
        <>
          <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3 mt-7 flex items-center gap-1.5">
            <MessageSquareText size={13} className="text-[#7C3AED]" /> OTP activity (last {otpStats.windowDays} days)
          </p>
          <div className="grid grid-cols-3 gap-2.5 mb-2">
            {[
              ["Codes sent", otpStats.totalRequested],
              ["Verified", otpStats.totalVerified],
              ["Expired unused", otpStats.totalExpiredUnverified],
              ["Wrong attempts", otpStats.totalFailedAttempts],
              ["Resends", otpStats.totalResends],
              ["Signup / Reset", `${otpStats.signupRequests} / ${otpStats.resetRequests}`],
            ].map(([label, value]) => (
              <div key={label} className="bg-white border border-[#ECE9F7] rounded-xl px-3 py-2.5">
                <p className="text-[15px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>{value}</p>
                <p className="text-[10.5px] text-[#6B6483]">{label}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3 mt-7 flex items-center gap-1.5">
        <ShieldCheck size={13} className="text-[#7C3AED]" /> Admin activity log
      </p>
      <div className="space-y-2">
        {adminActions.length === 0 && (
          <p className="text-[12px] text-[#6B6483]">No admin actions recorded yet.</p>
        )}
        {adminActions.map((a) => (
          <div key={a.id} className="bg-white border border-[#ECE9F7] rounded-xl px-3 py-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[12px] text-[#1E1B4B] truncate">{describeAction(a)}</p>
              <p className="text-[10.5px] text-[#8A8372]">by {a.adminName || "an admin"}</p>
            </div>
            <span className="text-[10px] text-[#8A8372] whitespace-nowrap shrink-0">
              {new Date(a.createdAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
