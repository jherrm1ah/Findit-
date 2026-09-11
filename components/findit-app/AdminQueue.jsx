"use client";

import { useState } from "react";
import { ClipboardList, Clock, CheckCircle2, X, AlertTriangle, ShieldCheck, MessageSquareText, UserPlus, PackageX, Link2, RefreshCw, BadgeCheck, HelpCircle, ExternalLink } from "lucide-react";
import { Pill } from "./shared";
import { naira } from "./data";
import { SELLER_TYPES } from "@/lib/sellerVerificationLevels";

function describeAction(a) {
  if (a.action === "seller.approved") return `Approved seller "${a.detail?.sellerName ?? a.targetId}"`;
  if (a.action === "seller.rejected") return `Rejected seller "${a.detail?.sellerName ?? a.targetId}"`;
  if (a.action === "user.promoted_admin") return `Made "${a.detail?.name ?? a.targetId}" an admin`;
  if (a.action === "user.demoted_admin") return `Removed "${a.detail?.name ?? a.targetId}"'s admin access`;
  if (a.action === "order.refunded") return `Refunded the buyer for "${a.detail?.item ?? a.targetId}"`;
  if (a.action === "order.payment_released") return `Released payment to ${a.detail?.seller ?? "the seller"} for "${a.detail?.item ?? a.targetId}"`;
  return `${a.action} (${a.targetType} ${a.targetId})`;
}

function TeamAccess({ onLookupUser, onPromoteToAdmin, onDemoteFromAdmin, currentAdminId, showToast }) {
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState(undefined); // undefined = not searched, null = not found, user = found
  const [looking, setLooking] = useState(false);
  const [acting, setActing] = useState(false);
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
    if (!result || acting) return;
    setActing(true);
    setError(null);
    try {
      const updated = await onPromoteToAdmin(phone.trim());
      setResult(updated);
      showToast?.(`${updated.name} is now an admin.`, "success");
    } catch (err) {
      setError(err.message || "Couldn't promote that account.");
    } finally {
      setActing(false);
    }
  };

  const demote = async () => {
    if (!result || acting) return;
    setActing(true);
    setError(null);
    try {
      const updated = await onDemoteFromAdmin(phone.trim());
      setResult(updated);
      showToast?.(`${updated.name}'s admin access was removed.`, "success");
    } catch (err) {
      setError(err.message || "Couldn't remove that account's admin access.");
    } finally {
      setActing(false);
    }
  };

  const isSelf = result && result.id === currentAdminId;

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
        <div className="mt-3 bg-[#F5F2FC] rounded-xl px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-semibold text-[#1E1B4B]">{result.name}</p>
              <p className="text-[11px] text-[#6B6483]">
                {result.role === "admin" ? "Admin" : result.role === "seller" ? "Seller account" : "Buyer account"}
              </p>
            </div>
            {result.role !== "admin" && (
              <button
                onClick={promote}
                disabled={acting}
                className="text-[12px] font-semibold text-white px-3.5 py-2 rounded-full disabled:opacity-40 shrink-0"
                style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
              >
                {acting ? "Promoting…" : "Promote to admin"}
              </button>
            )}
            {result.role === "admin" && !isSelf && (
              <button
                onClick={demote}
                disabled={acting}
                className="text-[12px] font-semibold text-[#E64980] bg-white border border-[#ECE9F7] px-3.5 py-2 rounded-full disabled:opacity-40 shrink-0"
              >
                {acting ? "Removing…" : "Remove admin access"}
              </button>
            )}
          </div>
          {result.role === "admin" && isSelf && (
            <p className="text-[11px] text-[#8A8372] mt-2">
              This is your own account — ask another admin to remove your access.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Orders where a buyer said something went wrong. FindIt is holding their
// money until someone here decides, so this sits above everything else.
function ReportedProblems({ orders, onResolve }) {
  const [acting, setActing] = useState(null);

  const resolve = async (orderId, outcome) => {
    setActing(orderId);
    try {
      await onResolve(orderId, outcome);
    } catch {
      // MainApp surfaced a toast
    } finally {
      setActing(null);
    }
  };

  if (orders.length === 0) {
    return <p className="text-[12px] text-[#6B6483] mb-7">No reported problems — every payment is either held or settled.</p>;
  }

  return (
    <div className="space-y-3 mb-7">
      {orders.map((o) => (
        <div key={o.id} className="bg-white border border-[#F5D9A8] rounded-[20px] p-4 shadow-sm shadow-[#4C1D95]/5">
          <div className="flex items-start justify-between mb-1">
            <div>
              <p className="text-[13px] font-semibold text-[#1E1B4B]">{o.item}</p>
              <p className="text-[11px] text-[#6B6483]">{o.seller} · {naira(o.price)} · {o.id}</p>
            </div>
            <Pill tone="gold"><AlertTriangle size={11} /> Payment held</Pill>
          </div>
          <p className="text-[12px] text-[#514B67] bg-[#FDF6EC] rounded-xl px-3 py-2 my-2.5">“{o.issueNote}”</p>
          <p className="text-[11px] text-[#6B6483] mb-3">
            Reported {o.issueReportedAt ? new Date(o.issueReportedAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" }) : "recently"}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => resolve(o.id, "refunded")}
              disabled={acting !== null}
              className={`flex-1 text-white text-[12px] font-semibold py-2 rounded-xl ${acting !== null ? "opacity-60" : ""}`}
              style={{ background: "linear-gradient(135deg,#F59E0B,#D97706)" }}
            >
              {acting === o.id ? "Working…" : "Refund the buyer"}
            </button>
            <button
              onClick={() => resolve(o.id, "released")}
              disabled={acting !== null}
              className={`flex-1 bg-white border border-[#ECE9F7] text-[#6B6483] text-[12px] font-semibold py-2 rounded-xl ${acting !== null ? "opacity-60" : ""}`}
            >
              Pay the seller
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Step D (verification) + Step B (backfill) of the seller_id migration —
// see the migration strategy this was built against. "Check status" and
// "Preview" only ever read; "Apply" only ever writes matched rows, and only
// after a preview exists so nobody can apply blind.
function SellerIdentityMigration({ onCheckStatus, onPreview, onApply, showToast }) {
  const [status, setStatus] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(null); // "status" | "preview" | "apply" | null

  const TABLES = ["products", "orders", "offers"];

  const runStatus = async () => {
    setLoading("status");
    try {
      setStatus(await onCheckStatus());
    } catch (err) {
      showToast?.(err.message || "Couldn't load the status report.", "error");
    } finally {
      setLoading(null);
    }
  };

  const runPreview = async () => {
    setLoading("preview");
    try {
      setPreview(await onPreview());
    } catch (err) {
      showToast?.(err.message || "Couldn't preview the backfill.", "error");
    } finally {
      setLoading(null);
    }
  };

  const runApply = async () => {
    setLoading("apply");
    try {
      const result = await onApply();
      const total = TABLES.reduce((sum, t) => sum + (result[t]?.appliedCount ?? 0), 0);
      showToast?.(`Backfilled seller_id on ${total} row${total === 1 ? "" : "s"}.`);
      setPreview(null); // state changed — force a fresh preview before applying again
      setStatus(await onCheckStatus());
    } catch (err) {
      showToast?.(err.message || "Couldn't apply the backfill.", "error");
    } finally {
      setLoading(null);
    }
  };

  const totalMatched = preview ? TABLES.reduce((sum, t) => sum + (preview[t]?.matchedCount ?? 0), 0) : 0;

  return (
    <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 mb-7">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[12px] text-[#6B6483]">
          Reliable seller identity for listings, orders and offers — additive only, nothing existing changes until you review and apply.
        </p>
      </div>

      <div className="flex gap-2 mt-3 mb-3">
        <button
          onClick={runStatus}
          disabled={loading !== null}
          className={`flex items-center gap-1.5 text-[12px] font-semibold px-3.5 py-2 rounded-xl border border-[#ECE9F7] text-[#1E1B4B] ${loading !== null ? "opacity-60" : ""}`}
        >
          <RefreshCw size={12} className={loading === "status" ? "animate-spin" : ""} /> Check status
        </button>
        <button
          onClick={runPreview}
          disabled={loading !== null}
          className={`flex items-center gap-1.5 text-[12px] font-semibold px-3.5 py-2 rounded-xl border border-[#ECE9F7] text-[#1E1B4B] ${loading !== null ? "opacity-60" : ""}`}
        >
          {loading === "preview" ? "Previewing…" : "Preview backfill"}
        </button>
        {preview && (
          <button
            onClick={runApply}
            disabled={loading !== null || totalMatched === 0}
            className={`flex items-center gap-1.5 text-white text-[12px] font-semibold px-3.5 py-2 rounded-xl ${loading !== null || totalMatched === 0 ? "opacity-40" : ""}`}
            style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
          >
            {loading === "apply" ? "Applying…" : `Apply backfill (${totalMatched})`}
          </button>
        )}
      </div>

      {status && (
        <div className="space-y-1.5 mb-3">
          {TABLES.map((t) => {
            const r = status[t];
            if (!r) return null;
            return (
              <div key={t} className="flex items-center justify-between text-[11px] text-[#514B67] bg-[#F5F2FC] rounded-lg px-2.5 py-1.5">
                <span className="capitalize font-medium">{t}</span>
                <span>
                  {r.withSellerId}/{r.total} have seller_id
                  {r.mismatched.length > 0 && (
                    <span className="text-[#E64980] font-semibold"> · {r.mismatched.length} mismatched</span>
                  )}
                </span>
              </div>
            );
          })}
          <p className="text-[10px] text-[#8A8372]">Orphaned relationships: {status.orphanedRelationships}</p>
        </div>
      )}

      {preview && (
        <div className="space-y-2 pt-2 border-t border-[#ECE9F7]">
          {TABLES.map((t) => {
            const p = preview[t];
            if (!p) return null;
            return (
              <div key={t} className="text-[11px] text-[#514B67]">
                <p className="font-medium capitalize mb-1">{t}: {p.matchedCount} safe to backfill{p.appliedCount ? ` (${p.appliedCount} already applied)` : ""}</p>
                {p.ambiguous.length > 0 && (
                  <p className="text-[#D97706] pl-2">
                    Ambiguous — needs a rename to resolve: {p.ambiguous.map((a) => `"${a.sellerName}" (${a.candidateCount} accounts, ${a.rowCount} rows)`).join(", ")}
                  </p>
                )}
                {p.unmatched.length > 0 && (
                  <p className="text-[#6B6483] pl-2">
                    No matching account: {p.unmatched.map((u) => `"${u.sellerName}" (${u.rowCount} rows)`).join(", ")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// The richer trust-verification queue — separate from the basic pending/
// approved/rejected account gate above (that one controls whether a seller
// can transact at all; this one drives the public New/Verified/Trusted
// badge). Evidence images are short-lived signed URLs generated fresh on
// every load of this queue — never stored, never public.
function VerificationSubmissions({ submissions, onReview, showToast }) {
  const [reviewingId, setReviewingId] = useState(null);
  const [reasonPromptFor, setReasonPromptFor] = useState(null); // { sellerId, action } | null
  const [reason, setReason] = useState("");

  const act = async (sellerId, action, actionReason) => {
    setReviewingId(sellerId);
    try {
      await onReview(sellerId, action, actionReason);
      setReasonPromptFor(null);
      setReason("");
    } catch {
      // MainApp already surfaced a toast
    } finally {
      setReviewingId(null);
    }
  };

  if (submissions.length === 0) {
    return <p className="text-[12px] text-[#6B6483] mb-7">No verification submissions waiting on review.</p>;
  }

  return (
    <div className="space-y-3 mb-7">
      {submissions.map(({ sellerId, sellerName, phone, overview }) => (
        <div key={sellerId} className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 shadow-sm shadow-[#4C1D95]/5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[13px] font-semibold text-[#1E1B4B]">{sellerName}</p>
            {overview.status === "needs_info" ? (
              <Pill tone="gold"><HelpCircle size={11} /> Needs info</Pill>
            ) : (
              <Pill tone="gold"><Clock size={11} /> Pending</Pill>
            )}
          </div>
          <p className="text-[11px] text-[#6B6483] mb-2">
            {phone || "No phone on file"} · {SELLER_TYPES.find((t) => t.value === overview.sellerType)?.label || "Seller type not set"} · {overview.category}
          </p>

          <div className="grid grid-cols-2 gap-2 text-[11px] text-[#514B67] bg-[#F5F2FC] rounded-xl p-3 mb-3">
            <div><span className="text-[#8A8372]">Location:</span> {[overview.publicArea, overview.publicCity, overview.publicState].filter(Boolean).join(", ") || "—"}</div>
            <div><span className="text-[#8A8372]">Physical store:</span> {overview.hasPhysicalStore ? "Yes" : "No"}</div>
            {overview.hasPhysicalStore && overview.shopAddress && (
              <div className="col-span-2"><span className="text-[#8A8372]">Shop address (private):</span> {overview.shopAddress}</div>
            )}
            {overview.description && <div className="col-span-2"><span className="text-[#8A8372]">Description:</span> {overview.description}</div>}
          </div>

          {overview.evidence.length > 0 && (
            <div className="mb-3">
              <p className="text-[10.5px] font-semibold text-[#8A8372] uppercase tracking-wide mb-1.5">Evidence</p>
              <div className="flex flex-wrap gap-2">
                {overview.evidence.map((ev, i) =>
                  ev.url ? (
                    <a key={i} href={ev.url} target="_blank" rel="noopener noreferrer" className="w-16 h-16 rounded-lg overflow-hidden border border-[#ECE9F7]">
                      <img src={ev.url} alt={ev.kind} className="w-full h-full object-cover" />
                    </a>
                  ) : (
                    <a
                      key={i}
                      href={ev.textValue}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] font-medium text-[#7C3AED] bg-white border border-[#ECE9F7] rounded-lg px-2 py-1.5"
                    >
                      {ev.note || ev.kind} <ExternalLink size={10} />
                    </a>
                  )
                )}
              </div>
            </div>
          )}

          {reasonPromptFor?.sellerId === sellerId ? (
            <div className="space-y-2">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder={reasonPromptFor.action === "needs_info" ? "What's missing?" : "Why isn't this approved?"}
                className="w-full border border-[#ECE9F7] rounded-lg px-2.5 py-2 text-[12px] outline-none resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => act(sellerId, reasonPromptFor.action, reason)}
                  disabled={!reason.trim() || reviewingId !== null}
                  className="flex-1 text-white text-[12px] font-semibold py-2 rounded-xl disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
                >
                  {reviewingId === sellerId ? "Sending…" : "Send"}
                </button>
                <button onClick={() => { setReasonPromptFor(null); setReason(""); }} className="px-3 text-[12px] font-semibold text-[#6B6483] border border-[#ECE9F7] rounded-xl">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => act(sellerId, "approved", null)}
                disabled={reviewingId !== null}
                className="flex-1 flex items-center justify-center gap-1.5 text-white text-[12px] font-semibold py-2 rounded-xl disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
              >
                <BadgeCheck size={13} /> {reviewingId === sellerId ? "Working…" : "Approve"}
              </button>
              <button
                onClick={() => setReasonPromptFor({ sellerId, action: "needs_info" })}
                disabled={reviewingId !== null}
                className="flex-1 bg-white border border-[#ECE9F7] text-[#514B67] text-[12px] font-semibold py-2 rounded-xl disabled:opacity-60"
              >
                Need more info
              </button>
              <button
                onClick={() => setReasonPromptFor({ sellerId, action: "rejected" })}
                disabled={reviewingId !== null}
                className="flex-1 bg-white border border-[#ECE9F7] text-[#E64980] text-[12px] font-semibold py-2 rounded-xl disabled:opacity-60"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      ))}
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
  onDemoteFromAdmin,
  reportedOrders = [],
  onResolveOrderIssue,
  onCheckSellerIdentityStatus,
  onPreviewSellerIdentityBackfill,
  onApplySellerIdentityBackfill,
  currentAdminId,
  showToast,
  sellerVerifications = [],
  onReviewSellerVerification,
}) {
  const unmatched = requests.filter((r) => r.offerCount === 0);

  return (
    <div className="px-5 pt-6 pb-10">
      <div className="flex items-center gap-2 mb-5">
        <ClipboardList size={17} className="text-[#7C3AED]" />
        <h1 className="text-[19px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>Admin queue</h1>
      </div>

      <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <PackageX size={13} className="text-[#D97706]" /> Reported problems
        {reportedOrders.length > 0 && (
          <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#D97706] text-white text-[10px] font-bold flex items-center justify-center">
            {reportedOrders.length}
          </span>
        )}
      </p>
      <ReportedProblems orders={reportedOrders} onResolve={onResolveOrderIssue} />

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

      <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <BadgeCheck size={13} className="text-[#7C3AED]" /> Seller trust verification
        {sellerVerifications.length > 0 && (
          <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#7C3AED] text-white text-[10px] font-bold flex items-center justify-center">
            {sellerVerifications.length}
          </span>
        )}
      </p>
      <p className="text-[11px] text-[#6B6483] mb-3 -mt-2">
        Separate from basic account approval above — this drives the public New/Verified/Trusted badge.
      </p>
      <VerificationSubmissions submissions={sellerVerifications} onReview={onReviewSellerVerification} showToast={showToast} />

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
        <Link2 size={13} className="text-[#7C3AED]" /> Seller identity migration
      </p>
      <SellerIdentityMigration
        onCheckStatus={onCheckSellerIdentityStatus}
        onPreview={onPreviewSellerIdentityBackfill}
        onApply={onApplySellerIdentityBackfill}
        showToast={showToast}
      />

      <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3 mt-7 flex items-center gap-1.5">
        <UserPlus size={13} className="text-[#7C3AED]" /> Team & admin access
      </p>
      <TeamAccess
        onLookupUser={onLookupUser}
        onPromoteToAdmin={onPromoteToAdmin}
        onDemoteFromAdmin={onDemoteFromAdmin}
        currentAdminId={currentAdminId}
        showToast={showToast}
      />

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
