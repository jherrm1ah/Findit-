# FindIt — Audit and Implementation Plan

Companion to `docs/BUILD-SPEC.md`. Section numbers below match that spec.

Audited against commit `6e5cf5c` (the merge of PR #2, "Payments, subscriptions, trust &
admin tooling, Phases 1-7"). Much of the spec describes work that **already shipped in that
merge**. This document separates what exists from what genuinely remains, so we do not
rebuild working systems.

Legend: ✅ built · 🟡 partial · 🔴 missing · ⚠️ blocked on external configuration

---

## Part 1 — Audit: what already exists

| § | System | State | Evidence |
|---|--------|-------|----------|
| 6 | Seller lifecycle pending/approved/rejected/suspended | ✅ | migration 013, `lib/repo.ts#assertSellerCanTransact` |
| 10 | Marketplace payments, Paystack init + webhook + verification | ✅ | `lib/payments.ts`, `lib/paystack.ts`, `app/api/orders/[id]/pay`, `app/api/payments/paystack/webhook` |
| 13 | Configurable platform fee, snapshotted per order | ✅ | `platform_fee_config` table, `orders.platform_fee_bps/_amount` |
| 14 | Transaction ledger | 🟡 | `payments` table already records kind = subscription/order/boost/fee/other |
| 20 | Risk signals, non-accusatory | ✅ | `lib/risk.ts`, `app/api/admin/risk-signals` |
| 21 | Paid boosts with admin-configurable pricing | ✅ | `boost_plans`, `boosts`, `app/api/products/[id]/boost` |
| 25 | Admin category management | ✅ | `categories` table, `app/api/admin/categories` |
| 26 | Support tickets | ✅ | `support_tickets`, `support_ticket_messages`, `lib/support.ts` |
| 28 | Admin analytics | ✅ | `lib/analytics.ts`, `app/api/admin/analytics` |
| 29 | Alert center | ✅ | `lib/alerts.ts`, `app/api/admin/alerts` |
| 30 | Five scoped admin roles, server-enforced | ✅ | `lib/adminRoles.ts`, migration 014 |
| 31 | Audit logging | 🟡 | `admin_actions` exists; needs previous/new value and reason on more actions |
| 9 | FindIt Pro purchase flow | ✅ | migration 010, `lib/subscriptions.ts`, `app/api/me/subscription` |
| 12 | Seller payouts | 🟡 | `payouts` table with pending/processing/paid/failed/manual_required |
| 5 | Verification wizard + admin review + private evidence storage | 🟡 | `SellerOnboarding.jsx`, `seller_verification_details/_evidence` |

Admin dashboard today has 13 tabs: Overview, Alerts, Sellers, Verification, Users, Payments,
Plans, Analytics, Categories, Risk, Support, Requests, Admin tools, Activity.

## Part 2 — Audit: what is genuinely missing

| § | Gap | State |
|---|-----|-------|
| 19 | **Delivery management.** `orders` has no delivery address, method, fee, tracking reference or proof of delivery. | 🔴 |
| 18 | **Returns workflow.** No return request, reason, evidence, or seller response. Disputes exist but returns do not. | 🔴 |
| 16 | **Reviews.** Ratings live as `my_rating`/`review_comment` columns on `orders`. No reviews table, no product reviews, no moderation, no reporting, no history. | 🔴 |
| 15 | **Refunds.** Only a full refund triggered by dispute resolution. No partial refunds, no refund records, reasons, or status tracking. | 🟡 |
| 2 | **Product reports / flagged products.** The overview spec wants these counts; no reports table exists. | 🔴 |
| 22 | **Advertising.** No advertiser, campaign, placement or budget tables. | 🔴 |
| 23 | **Enterprise accounts.** No staff users, multi-store ownership, or custom plans. | 🔴 |
| 1 | **Admin sections.** Missing as first-class areas: Stores, Products, Orders, Transactions, Boosts, Notifications, Settings, Audit Logs. | 🔴 |
| 11 | **Escrow lifecycle depth.** Five states exist; spec wants processing, shipped, awaiting confirmation, partially refunded and cancelled. | 🟡 |
| 13 | **Fee config depth.** Percentage exists; minimum, maximum, buyer fee and promotional rules do not. | 🟡 |
| 5 | **Verification depth.** No per-seller-type requirements, no history, no resubmission, no document upload. | 🟡 |
| 33 | **Legacy identity.** `orders.seller` and `products.seller` name strings remain alongside proper `seller_id` foreign keys. | 🟡 |

## Part 3 — Phased plan

Each phase ends with a status report in the spec's four-state format. Phases are ordered so
that money correctness lands before anything built on top of it.

### Phase 0 — Security review and plan (no code)
Spec §32 requires a plan before architectural change. Deliverable: a written review of every
API route's authorization, ownership checks, sensitive selects, remaining `select("*")`
usage, rate limiting, and webhook idempotency, plus a recommendation on whether Supabase RLS
can be introduced safely alongside custom auth and the service-role key. No auth changes
until that plan is accepted.

### Phase 1 — Order lifecycle and delivery (§11, §19)
Extend `orders` with delivery method, address, fee, status, tracking reference and proof of
delivery. Expand the escrow state machine to the full lifecycle. Wire buyer confirmation to
release. Keep logistics provider integration out; mark it Coming Soon.

### Phase 2 — Money correctness (§12, §14, §15, §13)
Partial refunds with reason, admin decision, provider reference and status. Payout records
gaining gross, processing fee, platform fee, refund amount and net. Ledger enrichment so
every financial event carries seller, store, order, gross, fees and net. Fee config gaining
minimum, maximum, buyer fee and promotional rules, all snapshotted per transaction.

### Phase 3 — Reviews, reports and reputation (§16, §17)
A real `reviews` table replacing the columns on `orders`, migrating existing ratings.
Verified-purchase enforcement. Product reports and admin moderation. Reputation inputs
extended with cancellation rate, dispute rate and account age, thresholds moved into config.

### Phase 4 — Returns integrated with disputes (§18)
Return requests with reason and evidence, seller response, admin review, and refund
triggering through the Phase 2 refund system. Built on the existing dispute records, not
beside them.

### Phase 5 — Admin dashboard completion (§1, §2, §3, §4, §7, §8)
The missing sections: Stores, Products, Orders, Transactions, Boosts, Notifications, Settings
and Audit Logs. Overview metrics completed and made clickable through to the owning section.
Subscription admin gaining subscriber breakdown, conversion, ARPU and history.

### Phase 6 — Verification depth (§5)
Per-seller-type requirement sets, so an online or home-based seller is never asked for
physical-store evidence. Verification history, resubmission, and document upload through the
existing private bucket.

### Phase 7 — Foundations, honestly labelled (§22, §23)
Advertising and enterprise schemas plus admin scaffolding, surfaced as Coming Soon until the
campaign and payment paths are real.

## Part 4 — External dependencies (§34)

| Dependency | Needed for | State |
|-----------|-----------|-------|
| `PAYSTACK_SECRET_KEY` | Order payments, subscriptions, boosts, refunds | ⚠️ not configured |
| Paystack webhook URL on the production domain | Payment confirmation | ⚠️ not registered |
| Paystack Transfers / payout recipients | Automatic seller payouts | ⚠️ needs business verification |
| `TERMII_API_KEY` | Signup and reset OTP by SMS | ⚠️ untested against live API |
| `GEMINI_API_KEY` | AI request classification | ⚠️ optional |
| Map / geocoding provider | Address picker, reverse geocoding | ⚠️ none chosen |
| Email provider | Receipts, payout notices | ⚠️ none chosen |
| Logistics provider | Tracking, proof of delivery | ⚠️ none chosen |

No phase simulates money movement. Where a provider is absent, the internal record is written
and the external step is reported as not configured rather than assumed successful.
