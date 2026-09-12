"use client";

import { useState, useEffect } from "react";
import { ClipboardList, Clock, CheckCircle2, X, AlertTriangle, ShieldCheck, MessageSquareText, UserPlus, PackageX, Link2, RefreshCw, BadgeCheck, HelpCircle, ExternalLink, LayoutGrid, Users, Store, CreditCard, ChevronRight, Search, ChevronLeft, Ban } from "lucide-react";
import { Pill } from "./shared";
import { naira } from "./data";
import { SELLER_TYPES } from "@/lib/sellerVerificationLevels";
import { ADMIN_ROLES, hasAdminPermission } from "@/lib/adminRolesLevels";

function describeAction(a) {
  if (a.action === "seller.approved") return `Approved seller "${a.detail?.sellerName ?? a.targetId}"`;
  if (a.action === "seller.rejected") return `Rejected seller "${a.detail?.sellerName ?? a.targetId}"${a.detail?.reason ? `: ${a.detail.reason}` : ""}`;
  if (a.action === "seller.suspended") return `Suspended seller "${a.detail?.sellerName ?? a.targetId}"${a.detail?.reason ? `: ${a.detail.reason}` : ""}`;
  if (a.action === "user.promoted_admin") return `Made "${a.detail?.name ?? a.targetId}" an admin`;
  if (a.action === "user.demoted_admin") return `Removed "${a.detail?.name ?? a.targetId}"'s admin access`;
  if (a.action === "user.suspended") return `Suspended account "${a.detail?.name ?? a.targetId}"${a.detail?.reason ? `: ${a.detail.reason}` : ""}`;
  if (a.action === "user.reactivated") return `Reactivated account "${a.detail?.name ?? a.targetId}"`;
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
  const [newAdminRole, setNewAdminRole] = useState("super_admin");

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
      const updated = await onPromoteToAdmin(phone.trim(), newAdminRole);
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

      {result && result.role !== "admin" && (
        <div className="mt-3">
          <label className="block text-[10.5px] font-medium text-[#514B67] mb-1">Admin role to grant</label>
          <select
            value={newAdminRole}
            onChange={(e) => setNewAdminRole(e.target.value)}
            className="w-full border border-[#ECE9F7] rounded-lg px-2.5 py-2 text-[12px] outline-none"
          >
            {ADMIN_ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label} — {r.description}</option>
            ))}
          </select>
        </div>
      )}

      {result && (
        <div className="mt-3 bg-[#F5F2FC] rounded-xl px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[#1E1B4B]">{result.name}</p>
              <p className="text-[11px] text-[#6B6483]">
                {result.role === "admin"
                  ? `Admin · ${ADMIN_ROLES.find((r) => r.value === result.adminRole)?.label || result.adminRole}`
                  : result.role === "seller" ? "Seller account" : "Buyer account"}
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

// The basic account lifecycle gate — separate from the richer trust
// verification queue below. This is what actually controls whether a
// seller can list/offer/upload (see assertSellerCanTransact in
// lib/repo.ts): pending and suspended both restrict it now, not just
// rejected, so these buttons have a real effect the moment they're clicked.
function SellerAccountList({ sellers, onStatusChange }) {
  const [actingId, setActingId] = useState(null);
  const [reasonPromptFor, setReasonPromptFor] = useState(null); // { id, status } | null
  const [reason, setReason] = useState("");

  const act = async (id, status, actionReason) => {
    setActingId(id);
    try {
      await onStatusChange(id, status, actionReason);
      setReasonPromptFor(null);
      setReason("");
    } catch {
      // MainApp already surfaced a toast
    } finally {
      setActingId(null);
    }
  };

  const STATUS_PILL = {
    pending: <Pill tone="gold"><Clock size={11} /> Pending</Pill>,
    approved: <Pill tone="green"><CheckCircle2 size={11} /> Approved</Pill>,
    rejected: <Pill tone="red"><X size={11} /> Rejected</Pill>,
    suspended: <Pill tone="red"><AlertTriangle size={11} /> Suspended</Pill>,
  };

  return (
    <div className="space-y-3 mb-7">
      {sellers.map((s) => (
        <div key={s.id} className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 shadow-sm shadow-[#4C1D95]/5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[13px] font-semibold text-[#1E1B4B]">{s.name}</p>
            {STATUS_PILL[s.status]}
          </div>
          <p className="text-[11px] text-[#6B6483] mb-1">{s.phone || "No phone on file"} · Applied {new Date(s.createdAt).toLocaleDateString("en-NG")}</p>
          {typeof s.activeProductCount === "number" && (
            <p className="text-[11px] text-[#8A8372] mb-2">
              {s.planName || "Free Seller"} · {s.activeProductCount} active listing{s.activeProductCount === 1 ? "" : "s"}
            </p>
          )}
          {s.statusReason && (s.status === "rejected" || s.status === "suspended") && (
            <p className="text-[11px] text-[#514B67] bg-[#FDF0F4] rounded-lg px-2.5 py-1.5 mb-2">Reason: {s.statusReason}</p>
          )}

          {reasonPromptFor?.id === s.id ? (
            <div className="space-y-2">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder={reasonPromptFor.status === "suspended" ? "Why is this seller being suspended?" : "Why isn't this seller approved?"}
                className="w-full border border-[#ECE9F7] rounded-lg px-2.5 py-2 text-[12px] outline-none resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => act(s.id, reasonPromptFor.status, reason)}
                  disabled={!reason.trim() || actingId !== null}
                  className="flex-1 text-white text-[12px] font-semibold py-2 rounded-xl disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
                >
                  {actingId === s.id ? "Sending…" : "Confirm"}
                </button>
                <button onClick={() => { setReasonPromptFor(null); setReason(""); }} className="px-3 text-[12px] font-semibold text-[#6B6483] border border-[#ECE9F7] rounded-xl">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              {s.status === "pending" && (
                <>
                  <button onClick={() => act(s.id, "approved")} disabled={actingId !== null} className="flex-1 text-white text-[12px] font-semibold py-2 rounded-xl disabled:opacity-60" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}>Approve</button>
                  <button onClick={() => setReasonPromptFor({ id: s.id, status: "rejected" })} disabled={actingId !== null} className="flex-1 bg-white border border-[#ECE9F7] text-[#E64980] text-[12px] font-semibold py-2 rounded-xl disabled:opacity-60">Reject</button>
                </>
              )}
              {s.status === "approved" && (
                <button onClick={() => setReasonPromptFor({ id: s.id, status: "suspended" })} disabled={actingId !== null} className="flex-1 bg-white border border-[#ECE9F7] text-[#E64980] text-[12px] font-semibold py-2 rounded-xl disabled:opacity-60">Suspend</button>
              )}
              {(s.status === "suspended" || s.status === "rejected") && (
                <button onClick={() => act(s.id, "approved")} disabled={actingId !== null} className="flex-1 text-white text-[12px] font-semibold py-2 rounded-xl disabled:opacity-60" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}>
                  {actingId === s.id ? "Working…" : "Reactivate"}
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Every number here comes straight from /api/admin/overview, which only
// computes (and only returns) a section when the requesting admin's role
// actually grants that permission domain — a scoped admin never even
// receives counts outside their own domains, let alone sees them rendered.
// A card only navigates to another tab when a real, working screen exists
// there; finance/user counts have no admin management screen yet (that's
// later phases), so those render as plain numbers, not dead links.
function StatCard({ label, value, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`bg-white border border-[#ECE9F7] rounded-xl px-3.5 py-3 text-left ${onClick ? "hover:border-[#D8CFF5] cursor-pointer" : ""}`}
    >
      <div className="flex items-center justify-between gap-1">
        <p className="text-[19px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>{value}</p>
        {onClick && <ChevronRight size={14} className="text-[#A79FC7]" />}
      </div>
      <p className="text-[10.5px] text-[#6B6483] mt-0.5">{label}</p>
    </Tag>
  );
}

function OverviewSection({ icon: Icon, title, children }) {
  return (
    <div className="mb-6">
      <p className="text-[11px] font-semibold text-[#8A8372] uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <Icon size={12} /> {title}
      </p>
      <div className="grid grid-cols-2 gap-2.5">{children}</div>
    </div>
  );
}

function AdminOverview({ overview, onNavigate }) {
  if (!overview) {
    return <p className="text-[12px] text-[#6B6483]">Loading overview…</p>;
  }
  const hasAnySection = overview.users || overview.sellers || overview.verification || overview.moderation || overview.finance;
  if (!hasAnySection) {
    return <p className="text-[12px] text-[#6B6483]">Your admin role doesn't have any dashboard stats yet.</p>;
  }
  return (
    <div>
      {overview.sellers && (
        <OverviewSection icon={Store} title="Sellers">
          <StatCard label="Pending review" value={overview.sellers.pending} onClick={() => onNavigate("sellers")} />
          <StatCard label="Approved" value={overview.sellers.approved} onClick={() => onNavigate("sellers")} />
          <StatCard label="Suspended" value={overview.sellers.suspended} onClick={() => onNavigate("sellers")} />
          <StatCard label="Rejected" value={overview.sellers.rejected} onClick={() => onNavigate("sellers")} />
        </OverviewSection>
      )}

      {overview.verification && (
        <OverviewSection icon={BadgeCheck} title="Trust verification">
          <StatCard label="Pending" value={overview.verification.pending} onClick={() => onNavigate("verification")} />
          <StatCard label="Needs info" value={overview.verification.needsInfo} onClick={() => onNavigate("verification")} />
        </OverviewSection>
      )}

      {overview.moderation && (
        <OverviewSection icon={PackageX} title="Disputes">
          <StatCard label="Payments held on a reported problem" value={overview.moderation.openDisputes} onClick={() => onNavigate("sellers")} />
        </OverviewSection>
      )}

      {overview.users && (
        <OverviewSection icon={Users} title="Users">
          <StatCard label="Total accounts" value={overview.users.total} onClick={() => onNavigate("users")} />
          <StatCard label="Buyers" value={overview.users.buyers} onClick={() => onNavigate("users")} />
          <StatCard label="Seller accounts" value={overview.users.sellers} onClick={() => onNavigate("users")} />
          <StatCard label="Suspended" value={overview.users.suspended} onClick={() => onNavigate("users")} />
        </OverviewSection>
      )}

      {overview.finance && (
        <OverviewSection icon={CreditCard} title="Subscriptions">
          <StatCard label="Paid store plans" value={overview.finance.paidStoreSubscriptions} />
          <StatCard label="Free store plans" value={overview.finance.freeStoreSubscriptions} />
          <StatCard label="FindIt Pro (buyers)" value={overview.finance.activePlatformSubscriptions} />
        </OverviewSection>
      )}
    </div>
  );
}

const ROLE_FILTERS = [
  { value: "", label: "All" },
  { value: "buyer", label: "Buyers" },
  { value: "seller", label: "Sellers" },
  { value: "admin", label: "Admins" },
];

const ROLE_LABEL = { buyer: "Buyer", seller: "Seller", admin: "Admin" };

// The real "browse every account" screen — separate from TeamAccess's
// exact-phone lookup (which only ever exists to find one account before
// promoting it). Suspension here is platform-wide and independent of a
// seller's own approve/reject/suspend status: this can restrict a buyer
// who has never touched the seller flow at all.
function UsersManagement({ onLoadUsers, onSetSuspended, currentAdminId }) {
  const [role, setRole] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState(null);
  const [reasonPromptFor, setReasonPromptFor] = useState(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    onLoadUsers({ role: role || undefined, search: search || undefined, page })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [role, search, page]);

  const submitSearch = (e) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const act = async (id, suspended, actionReason) => {
    setActingId(id);
    try {
      await onSetSuspended(id, suspended, actionReason);
      setReasonPromptFor(null);
      setReason("");
      const result = await onLoadUsers({ role: role || undefined, search: search || undefined, page });
      setData(result);
    } catch {
      // MainApp already surfaced a toast
    } finally {
      setActingId(null);
    }
  };

  return (
    <div>
      <form onSubmit={submitSearch} className="flex gap-2 mb-3">
        <div className="flex-1 flex items-center gap-2 border border-[#ECE9F7] rounded-xl px-3 bg-white min-w-0">
          <Search size={13} className="text-[#A79FC7] shrink-0" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or phone"
            className="flex-1 min-w-0 py-2.5 text-[13px] outline-none"
          />
        </div>
        <button
          type="submit"
          className="text-[12.5px] font-semibold text-white px-4 rounded-xl shrink-0"
          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
        >
          Search
        </button>
      </form>

      <div className="flex gap-1.5 mb-4 overflow-x-auto">
        {ROLE_FILTERS.map((r) => (
          <button
            key={r.value}
            onClick={() => {
              setRole(r.value);
              setPage(1);
            }}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-full whitespace-nowrap shrink-0 ${
              role === r.value ? "text-white" : "text-[#514B67] bg-white border border-[#ECE9F7]"
            }`}
            style={role === r.value ? { background: "linear-gradient(135deg,#A855F7,#7C3AED)" } : undefined}
          >
            {r.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-[12px] text-[#6B6483]">Loading…</p>}
      {!loading && data && data.users.length === 0 && (
        <p className="text-[12px] text-[#6B6483]">No accounts match.</p>
      )}

      <div className="space-y-3 mb-4">
        {!loading &&
          data?.users.map((u) => (
            <div key={u.id} className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 shadow-sm shadow-[#4C1D95]/5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[13px] font-semibold text-[#1E1B4B]">{u.name}</p>
                {u.suspended ? (
                  <Pill tone="red">
                    <Ban size={11} /> Suspended
                  </Pill>
                ) : (
                  <Pill tone="stone">{ROLE_LABEL[u.role] || u.role}</Pill>
                )}
              </div>
              <p className="text-[11px] text-[#6B6483] mb-2">
                {u.phone}
                {u.businessName ? ` · ${u.businessName}` : ""} · Joined {new Date(u.createdAt).toLocaleDateString("en-NG")}
              </p>
              {u.suspended && u.suspendedReason && (
                <p className="text-[11px] text-[#514B67] bg-[#FDF0F4] rounded-lg px-2.5 py-1.5 mb-2">Reason: {u.suspendedReason}</p>
              )}

              {reasonPromptFor === u.id ? (
                <div className="space-y-2">
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    placeholder="Why is this account being suspended?"
                    className="w-full border border-[#ECE9F7] rounded-lg px-2.5 py-2 text-[12px] outline-none resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => act(u.id, true, reason)}
                      disabled={!reason.trim() || actingId !== null}
                      className="flex-1 text-white text-[12px] font-semibold py-2 rounded-xl disabled:opacity-40"
                      style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
                    >
                      {actingId === u.id ? "Suspending…" : "Confirm"}
                    </button>
                    <button
                      onClick={() => {
                        setReasonPromptFor(null);
                        setReason("");
                      }}
                      className="px-3 text-[12px] font-semibold text-[#6B6483] border border-[#ECE9F7] rounded-xl"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  {u.suspended ? (
                    <button
                      onClick={() => act(u.id, false)}
                      disabled={actingId !== null}
                      className="flex-1 text-white text-[12px] font-semibold py-2 rounded-xl disabled:opacity-60"
                      style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
                    >
                      {actingId === u.id ? "Working…" : "Reactivate"}
                    </button>
                  ) : u.id !== currentAdminId ? (
                    <button
                      onClick={() => setReasonPromptFor(u.id)}
                      disabled={actingId !== null}
                      className="flex-1 bg-white border border-[#ECE9F7] text-[#E64980] text-[12px] font-semibold py-2 rounded-xl disabled:opacity-60"
                    >
                      Suspend
                    </button>
                  ) : (
                    <p className="text-[11px] text-[#8A8372]">This is your own account.</p>
                  )}
                </div>
              )}
            </div>
          ))}
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1 text-[12px] font-semibold text-[#514B67] disabled:opacity-30"
          >
            <ChevronLeft size={14} /> Prev
          </button>
          <p className="text-[11px] text-[#8A8372]">
            Page {data.page} of {data.totalPages} · {data.total} accounts
          </p>
          <button
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page >= data.totalPages}
            className="flex items-center gap-1 text-[12px] font-semibold text-[#514B67] disabled:opacity-30"
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

const PAYOUT_STATUS_PILL = {
  pending: <Pill tone="gold">Pending</Pill>,
  processing: <Pill tone="gold">Processing</Pill>,
  paid: <Pill tone="green">Paid</Pill>,
  failed: <Pill tone="red">Failed</Pill>,
  manual_required: <Pill tone="red">Needs manual payout</Pill>,
};

// Real platform commission + seller payout ledger — see lib/payments.ts.
// The fee editor writes an append-only history row (never an update), and
// "Mark paid" is only ever an admin recording a real off-platform transfer
// they already made, never a claim this app made one itself.
function PaymentsAdmin({ onLoadFeeConfig, onSetFeeConfig, onLoadPayouts, onMarkPayoutPaid, showToast }) {
  const [feeConfig, setFeeConfig] = useState(null);
  const [feeInput, setFeeInput] = useState("");
  const [savingFee, setSavingFee] = useState(false);
  const [payouts, setPayouts] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [actingId, setActingId] = useState(null);

  useEffect(() => {
    onLoadFeeConfig().then((c) => {
      setFeeConfig(c);
      setFeeInput((c.currentBps / 100).toString());
    }).catch(() => {});
  }, []);

  useEffect(() => {
    onLoadPayouts(statusFilter || undefined).then(setPayouts).catch(() => setPayouts([]));
  }, [statusFilter]);

  const saveFee = async (e) => {
    e.preventDefault();
    const pct = Number(feeInput);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      showToast?.("Enter a fee between 0 and 100%.", "error");
      return;
    }
    setSavingFee(true);
    try {
      await onSetFeeConfig(Math.round(pct * 100));
      const updated = await onLoadFeeConfig();
      setFeeConfig(updated);
      showToast?.(`Platform fee set to ${pct}%.`);
    } catch (err) {
      showToast?.(err.message || "Couldn't update the fee.", "error");
    } finally {
      setSavingFee(false);
    }
  };

  const markPaid = async (id) => {
    setActingId(id);
    try {
      await onMarkPayoutPaid(id);
      setPayouts(await onLoadPayouts(statusFilter || undefined));
      showToast?.("Payout marked paid.");
    } catch (err) {
      showToast?.(err.message || "Couldn't mark that payout paid.", "error");
    } finally {
      setActingId(null);
    }
  };

  return (
    <div>
      <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-4 mb-7">
        <p className="text-[12px] font-semibold text-[#1E1B4B] mb-1">Platform commission</p>
        <p className="text-[11px] text-[#6B6483] mb-3">
          Applies to every order paid from now on — an already-paid order keeps whatever fee it was actually charged (see order.platformFeeBps), never recalculated.
        </p>
        {feeConfig && (
          <>
            <p className="text-[20px] font-bold text-[#1E1B4B] mb-3" style={{ fontFamily: "Fraunces, serif" }}>
              {(feeConfig.currentBps / 100).toFixed(2)}%
            </p>
            <form onSubmit={saveFee} className="flex gap-2">
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={feeInput}
                onChange={(e) => setFeeInput(e.target.value)}
                className="flex-1 border border-[#ECE9F7] rounded-lg px-2.5 py-2 text-[13px] outline-none"
              />
              <button
                type="submit"
                disabled={savingFee}
                className="text-[12.5px] font-semibold text-white px-4 rounded-xl disabled:opacity-40"
                style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
              >
                {savingFee ? "Saving…" : "Save"}
              </button>
            </form>
          </>
        )}
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide">Seller payouts</p>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-[11.5px] border border-[#ECE9F7] rounded-lg px-2 py-1.5 outline-none"
        >
          <option value="">All</option>
          <option value="manual_required">Needs manual payout</option>
          <option value="failed">Failed</option>
          <option value="processing">Processing</option>
          <option value="paid">Paid</option>
        </select>
      </div>

      <div className="space-y-2.5">
        {payouts?.length === 0 && <p className="text-[12px] text-[#6B6483]">No payouts match.</p>}
        {payouts?.map((p) => (
          <div key={p.id} className="bg-white border border-[#ECE9F7] rounded-xl p-3.5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[12.5px] font-semibold text-[#1E1B4B]">{p.sellerName || p.sellerId}</p>
              {PAYOUT_STATUS_PILL[p.status]}
            </div>
            <p className="text-[11px] text-[#6B6483] mb-1.5">Order {p.orderId} · {naira(p.amount)}</p>
            {p.failureReason && (
              <p className="text-[11px] text-[#514B67] bg-[#FDF0F4] rounded-lg px-2 py-1.5 mb-1.5">{p.failureReason}</p>
            )}
            {(p.status === "manual_required" || p.status === "failed") && (
              <button
                onClick={() => markPaid(p.id)}
                disabled={actingId !== null}
                className="text-[11.5px] font-semibold text-white px-3 py-1.5 rounded-lg disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
              >
                {actingId === p.id ? "Saving…" : "Mark paid"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminQueue({
  sellers,
  requests,
  onSellerStatusChange,
  adminActions = [],
  otpStats = null,
  overview = null,
  onLookupUser,
  onPromoteToAdmin,
  onDemoteFromAdmin,
  reportedOrders = [],
  onResolveOrderIssue,
  onCheckSellerIdentityStatus,
  onPreviewSellerIdentityBackfill,
  onApplySellerIdentityBackfill,
  currentAdminId,
  currentAdminRole,
  showToast,
  sellerVerifications = [],
  onReviewSellerVerification,
  onLoadUsers,
  onSetUserSuspended,
  onLoadFeeConfig,
  onSetFeeConfig,
  onLoadPayouts,
  onMarkPayoutPaid,
}) {
  const unmatched = requests.filter((r) => r.offerCount === 0);
  const can = (permission) => hasAdminPermission(currentAdminRole, permission);
  const isSuperAdmin = currentAdminRole === "super_admin";

  // Every tab here backs a real, already-working screen — there's
  // deliberately no Transactions/Boosts/Categories tab yet, since those
  // systems don't exist in the app below this UI. Adding a tab for a
  // system that isn't built would be exactly the "looks complete but isn't"
  // problem this dashboard exists to avoid.
  const TABS = [
    { key: "overview", label: "Overview", icon: LayoutGrid },
    can("moderation") && { key: "sellers", label: "Sellers", icon: Store },
    can("verification") && { key: "verification", label: "Verification", icon: BadgeCheck },
    can("users") && { key: "users", label: "Users", icon: Users },
    can("finance") && { key: "payments", label: "Payments", icon: CreditCard },
    { key: "requests", label: "Requests", icon: AlertTriangle },
    isSuperAdmin && { key: "admin", label: "Admin tools", icon: UserPlus },
    { key: "activity", label: "Activity", icon: ShieldCheck },
  ].filter(Boolean);

  const [tab, setTab] = useState("overview");
  const activeTab = TABS.some((t) => t.key === tab) ? tab : TABS[0].key;

  return (
    <div className="px-5 pt-6 pb-10">
      <div className="flex items-center gap-2 mb-4">
        <ClipboardList size={17} className="text-[#7C3AED]" />
        <h1 className="text-[19px] font-bold text-[#1E1B4B]" style={{ fontFamily: "Fraunces, serif" }}>Admin dashboard</h1>
        {currentAdminRole && !isSuperAdmin && (
          <span className="text-[10px] font-semibold text-[#7C3AED] bg-[#F5F2FC] px-2 py-1 rounded-full">
            {ADMIN_ROLES.find((r) => r.value === currentAdminRole)?.label}
          </span>
        )}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-4 mb-1 -mx-5 px-5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 text-[12.5px] font-semibold px-3.5 py-2 rounded-full whitespace-nowrap shrink-0 ${
              activeTab === t.key ? "text-white" : "text-[#514B67] bg-white border border-[#ECE9F7]"
            }`}
            style={activeTab === t.key ? { background: "linear-gradient(135deg,#A855F7,#7C3AED)" } : undefined}
          >
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && <AdminOverview overview={overview} onNavigate={setTab} />}

      {activeTab === "sellers" && can("moderation") && (
        <>
          <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <PackageX size={13} className="text-[#D97706]" /> Reported problems
            {reportedOrders.length > 0 && (
              <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#D97706] text-white text-[10px] font-bold flex items-center justify-center">
                {reportedOrders.length}
              </span>
            )}
          </p>
          <ReportedProblems orders={reportedOrders} onResolve={onResolveOrderIssue} />

          <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-1">Seller accounts</p>
          <p className="text-[11px] text-[#6B6483] mb-3">
            Controls whether a seller can list, send offers, or edit listings at all — pending and suspended now
            actually restrict this, not just rejected.
          </p>
          <SellerAccountList sellers={sellers} onStatusChange={onSellerStatusChange} />
        </>
      )}

      {activeTab === "verification" && can("verification") && (
        <>
          <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <BadgeCheck size={13} className="text-[#7C3AED]" /> Seller trust verification
            {sellerVerifications.length > 0 && (
              <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#7C3AED] text-white text-[10px] font-bold flex items-center justify-center">
                {sellerVerifications.length}
              </span>
            )}
          </p>
          <p className="text-[11px] text-[#6B6483] mb-3 -mt-2">
            Separate from basic account approval — this drives the public New/Verified/Trusted badge.
          </p>
          <VerificationSubmissions submissions={sellerVerifications} onReview={onReviewSellerVerification} showToast={showToast} />
        </>
      )}

      {activeTab === "users" && can("users") && (
        <>
          <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Users size={13} className="text-[#7C3AED]" /> All accounts
          </p>
          <p className="text-[11px] text-[#6B6483] mb-3 -mt-2">
            Platform-wide suspend/reactivate — independent of a seller's own approve/reject/suspend status above.
          </p>
          <UsersManagement onLoadUsers={onLoadUsers} onSetSuspended={onSetUserSuspended} currentAdminId={currentAdminId} />
        </>
      )}

      {activeTab === "payments" && can("finance") && (
        <>
          <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <CreditCard size={13} className="text-[#7C3AED]" /> Platform fees & seller payouts
          </p>
          <p className="text-[11px] text-[#6B6483] mb-3 -mt-2">
            Fee changes only affect orders paid from now on — past orders keep the fee that was in force when they were paid.
          </p>
          <PaymentsAdmin
            onLoadFeeConfig={onLoadFeeConfig}
            onSetFeeConfig={onSetFeeConfig}
            onLoadPayouts={onLoadPayouts}
            onMarkPayoutPaid={onMarkPayoutPaid}
            showToast={showToast}
          />
        </>
      )}

      {activeTab === "requests" && (
        <>
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
        </>
      )}

      {activeTab === "admin" && isSuperAdmin && (
        <>
          <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <UserPlus size={13} className="text-[#7C3AED]" /> Team & admin access
          </p>
          <div className="mb-7">
            <TeamAccess
              onLookupUser={onLookupUser}
              onPromoteToAdmin={onPromoteToAdmin}
              onDemoteFromAdmin={onDemoteFromAdmin}
              currentAdminId={currentAdminId}
              showToast={showToast}
            />
          </div>

          <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Link2 size={13} className="text-[#7C3AED]" /> Seller identity migration
          </p>
          <SellerIdentityMigration
            onCheckStatus={onCheckSellerIdentityStatus}
            onPreview={onPreviewSellerIdentityBackfill}
            onApply={onApplySellerIdentityBackfill}
            showToast={showToast}
          />
        </>
      )}

      {activeTab === "activity" && (
        <>
          {otpStats && (
            <>
              <p className="text-[12px] font-semibold text-[#1E1B4B] uppercase tracking-wide mb-3 flex items-center gap-1.5">
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
        </>
      )}
    </div>
  );
}
