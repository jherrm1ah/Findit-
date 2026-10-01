# FindIt — Project Status & Developer Handover

**Last verified:** 2026-10-01, against the `main` branch (commit `075c73e`) and the live
production deployment at `shopwithfindit.com`. Written to let a new developer take over
without needing to ask the previous owner basic questions.

See also:
- [`DATABASE.md`](./DATABASE.md) — full table-by-table database reference, relationships,
  RLS, storage buckets, functions, and migration history.
- [`.env.example`](./.env.example) — the authoritative, already-well-commented list of every
  environment variable, copy-pasteable into `.env.local`.
- `docs/BUILD-SPEC.md` / `docs/IMPLEMENTATION-PLAN.md` — the historical product spec and
  build audit from an earlier phase of this project. Useful background on *why* things are
  built the way they are, but not kept up to date — this file (`PROJECT_STATUS.md`) is the
  current source of truth.

---

## 1. Project Overview

### What FindIt does

FindIt is a campus/local marketplace: buyers browse or search listings, or post a free-text
**request** for something they can't find, and sellers respond with **offers**. A buyer can
also buy a listing directly. Every purchase becomes a real **order** with escrow — FindIt
holds the buyer's payment until the buyer confirms delivery, then releases it to the seller
(minus a platform fee). Sellers run a **store**: a verified profile, product listings, and
(on paid plans) a branded public storefront page. There's in-app chat between buyer and
seller, a support-ticket system, and a full admin console for moderation, verification,
disputes, payouts, and platform configuration.

Two independent paid-subscription tracks exist:
- **Store plans** (per seller) — more product slots, analytics, storefront customization,
  featured placement, priority support.
- **FindIt Pro** (per user, buyer or seller) — a badge + priority support, account-wide.

Sellers can also pay to **boost** a listing (temporary front-of-browse placement).

### Current architecture

- **Framework**: Next.js 14.2.35, App Router, TypeScript (`strict: true`).
- **Routing model**: a hybrid. A handful of real Next.js routes are server-rendered for SEO
  (`/`, `/store/[slug]`, `/verify/[code]`, `/privacy`, `/terms`, plus PWA manifest/icon
  routes) — but the actual product is a **single-page app**: `app/page.tsx` renders one
  `<App />` component (`components/findit-app/App.jsx`), and everything inside it (home,
  browse, cart, checkout, seller dashboard, admin console, ~25 screens total) is client-side
  React state switching, not separate URLs. Every backend endpoint is a Next.js **API route
  handler** under `app/api/**/route.ts` (99 files) — no separate backend service.
- **Database**: Supabase-hosted Postgres, accessed **only** from the server, **only** via the
  Supabase **service-role key** (`lib/db.ts`). This is a deliberate, documented choice (see
  §4 and §7) — the app does **not** use Supabase Auth, and RLS is not the real security
  boundary; every API route does its own auth/ownership checks.
- **File storage**: Supabase Storage, two buckets (`product-images` public,
  `seller-verification` private) — see §4.
- **No ORM** — raw Supabase query-builder calls, centralized in `lib/repo.ts` and a handful
  of feature-specific `lib/*.ts` modules, each the "business logic" layer behind one or more
  API routes.
- **No websockets/real-time** — chat (`Thread.jsx`) polls every 4 seconds. No Supabase
  Realtime subscriptions anywhere.
- **No state-management library** — plain React `useState`/`useRef` in the SPA shell.
- **Payments**: Paystack (Nigerian payment processor) — see §3.
- **Error monitoring**: Sentry (`@sentry/nextjs`), optional — no-ops cleanly if
  `NEXT_PUBLIC_SENTRY_DSN` is unset.
- **AI**: Google Gemini (`@google/genai`) — optional, powers two assist features (request
  classification, product-description generation); both no-op/report "not configured" if
  `GEMINI_API_KEY` is unset.
- **SMS/OTP delivery**: Termii — optional; if unset, phone verification is simply skipped
  fleet-wide (not a per-deployment toggle in the UI, just an env var).

### Frontend / backend technologies

| Layer | Technology |
|---|---|
| Framework | Next.js 14.2.35 (App Router) |
| UI | React 18.3.1, Tailwind CSS 3.4.4, `motion/react` 13.4.0 (animation), `lucide-react` (icons) |
| Language | TypeScript 5.5.3 (`strict: true`) for `lib/`/`app/api`; the SPA UI is `.jsx` |
| Backend | Next.js Route Handlers (`app/api/**/route.ts`) — no separate server |
| Database client | `@supabase/supabase-js` 2.115.0, service-role key only |
| Payments | Paystack REST API via a thin hand-written `fetch` wrapper (`lib/paystack.ts`) — no SDK |
| Testing | Vitest 1.6.1 — unit tests + "integration" tests against an in-memory fake Supabase client (`lib/testing/fakeSupabase.ts`), no real DB/network in CI |
| Error monitoring | Sentry (`@sentry/nextjs`) |
| AI | Google Gemini (`@google/genai`) |
| SMS | Termii |
| Package manager | npm (only `package-lock.json` is present) |
| Hosting | Vercel |

### Supabase usage

Supabase is used purely as **managed Postgres + file storage** — not as a BaaS with its own
auth or client-side access:

- **No Supabase Auth.** Authentication is 100% custom (phone + password, custom `sessions`
  table, custom cookie) — see §2 and §7.
- **No client-side Supabase calls, ever.** There is no `NEXT_PUBLIC_SUPABASE_*` env var
  anywhere in the codebase (verified by full-repo grep). The browser only ever talks to
  FindIt's own `/api/*` routes.
- **Row Level Security is enabled on every table, with zero policies defined anywhere.** This
  is intentional defense-in-depth, not an oversight — explained in a long comment at the top
  of `supabase/schema.sql`. Since the app always connects with the service-role key (which
  bypasses RLS), the actual authorization boundary is the Next.js API route layer, not
  Postgres. RLS being enabled with no policies means: *if* the anon/public key ever leaked or
  got used somewhere, it would be denied all access by default. See §7 for why this matters
  for a new developer.
- **One SQL function**: `check_rate_limit()` (backs `lib/rateLimit.ts`). No triggers exist —
  every `updated_at` column is written by application code, not the database.
- **Storage**: two buckets, created lazily by the app itself (not pre-provisioned via SQL or
  the dashboard) — see §4.

---

## 2. Current Completed Features

Status legend: **✅ working** (verified by reading the actual implementation) · **🟡
partial** (works, but with a real, noted limitation) · nothing in this app is a fake/mock
placeholder — the one "Coming soon" UI mechanism that exists (`live: false` flags in
`FindItPro.jsx`/`StorePlans.jsx`) currently has **zero** features flagged that way; everything
listed as a plan perk is backed by real code.

### Authentication — ✅ working, fully custom (not Supabase Auth)
- Phone + password. Password hashed with `crypto.scryptSync` + per-user random salt; login
  compares with `crypto.timingSafeEqual` and hashes against a dummy salt on an unknown-phone
  path specifically to prevent timing-based account enumeration.
- Optional phone-verification OTP (6-digit, HMAC-hashed, DB-backed, real rate limits) for
  signup and password reset — sent via Termii. If `TERMII_API_KEY` is unset, OTP is skipped
  entirely (not required) — a deliberate "works with zero paid dependencies out of the box"
  design, not a bug.
- Sessions: a custom `sessions` table, opaque random 256-bit token (not a JWT) in an
  `httpOnly`, `SameSite=Lax` cookie, 30-day expiry — revocable server-side by deleting the row.
- A separate **admin step-up ("unlock")** layer: holding an `admin` role session is not
  enough to reach `/api/admin/*` — a fresh password re-entry (default 60 min validity) is
  required, tracked per-session. See §7.
- Routes: `app/api/auth/{signup,login,logout,send-otp,verify-otp,resend-otp,reset-password,me,name,phone,password,business-name,avatar,notifications,become-seller}`.

### User profiles — ✅ working
- Fields: name, phone, optional email, role, business name, geolocation (only on explicit
  browser permission grant), avatar, notification preference.
- Edited via small, single-purpose PATCH routes rather than one big profile-update endpoint
  (changing phone/password re-verifies the current password; a password change also destroys
  every *other* session).

### Seller functionality — ✅ working
- Becoming a seller: sign up as one, or an existing buyer self-upgrades
  (`POST /api/auth/become-seller`) — either way creates a `sellers` row (`status: pending`)
  plus a free Store plan. An admin must approve the seller before they can list/sell/receive
  orders.
- **Store** = the seller's account + (on a paid plan only) a public storefront page at
  `/store/<slug>`. A seller on the Free plan has no live storefront page even if they
  previously claimed a slug — the slug stays reserved for them, the page just reports
  "unavailable."
- Storefront customization is real and server-gated by plan tier, not just a UI toggle: 4
  layout **templates** (classic/compact/gallery/showcase) and 8 curated accent **colors**,
  both resolved against the seller's *current, live* plan on every read — if a subscription
  lapses, the public page silently reverts to the default template/color even though the
  stored preference is still the fancy one (`effectiveStoreTemplate`/`effectiveStoreAccent`
  in `lib/subscriptions.ts`), so a lapsed seller never keeps rendering a benefit they're no
  longer paying for.
- Seller **verification** (a trust badge, separate from "approved to sell"): a wizard submits
  seller type/category/evidence (photos via the private storage bucket, or link evidence); an
  admin approves/rejects/requests more info. Verification **levels** — `new → verified →
  trusted` — are computed from hard-coded thresholds (Trusted needs ≥10 completed orders, 0
  disputes, ≥4.0 rating), not admin-editable.
- Public seller directory (`/api/sellers/directory` + `SellerDirectory.jsx`) — Pro-tier
  sellers sort first.

### Product listings — ✅ working
- Full CRUD, seller-owned (ownership checked via `sellerIdentityMatch.ts`, which deliberately
  avoids trusting a plain business-name string match, since `business_name` has no database
  uniqueness constraint).
- Fields: category, name, price, description, condition (new listings must be "New" —
  existing "Used" rows are grandfathered), quantity, location, delivery option, color,
  variation, up to 4 ordered images.
- Images are stored via `lib/storage.ts` with **real magic-byte content verification** (not
  just a trusted client `Content-Type` header), server-generated filenames (no path-traversal
  risk), and a 5 MB cap. **No resizing/thumbnailing** — originals are served as-is (Next's
  `<Image>` does render-time resizing only, not stored copies).
- Admin-configurable keyword **moderation rules**: a "block" match refuses the listing
  outright at creation; a "flag" match lets it through marked `under_review`.
- `active` (subscription-plan-limit driven — a downgrade deactivates the oldest excess
  listings, never deletes) is tracked separately from `moderationStatus`
  (`active`/`under_review`/`removed`).
- **Boosts** (paid): a seller pays via Paystack to move one listing to the front of
  Home/Browse for a fixed number of days (admin-editable pricing in `boost_plans`); stacks
  additively on top of any remaining boost window; expiry is proactively notified via a daily
  cron sweep (see §3 and §6).

### Search / categories / geo — 🟡 working, but entirely client-side
- `GET /api/products` returns the **entire catalog**, unpaginated and unfiltered — search and
  category filtering both happen as a `.filter()` over that full array in React state
  (`Browse.jsx`/`Home.jsx`). There is no server-side full-text search and no query
  parameters. This is fine at today's catalog size; it is a real scalability concern as the
  catalog grows — see §8.
- Categories are a real, admin-editable DB taxonomy (`lib/categoryCatalog.ts`); a static
  15-category list (`lib/categories.js`) exists only as the client's pre-fetch placeholder,
  never a second source of truth.
- "Near you" / distance sort is pure client-side haversine math (`lib/geo.ts`) using the
  buyer's browser-geolocation coordinates against each listing's stored lat/lng — no
  server-side radius query, no PostGIS.

### Requests / offers — ✅ working
Buyer posts a request → sellers whose active listings match the category (or, for "not
sure," every approved seller, capped at 50 recipients) get an in-app notification
(`lib/requestMatching.ts` decides who, pure/unit-tested) → sellers submit real offers → buyer
accepts exactly one, which atomically (race-safe conditioned update) flips the request to
`matched` and creates a real order in `Awaiting payment` — accepting an offer does **not**
move money by itself, only checkout does. Losing sellers on the same request get a "not
selected" notification. The buyer can cancel a still-open request.

### Orders — ✅ working, real escrow state machine
- Status progression (forward-only, enforced server-side):
  `Awaiting payment → Seller preparing → Dispatched → Out for delivery → Delivered`. Only the
  **buyer** can mark `Delivered`.
- Escrow states: `unpaid → held → released|disputed → refunded`. `confirmDelivery` is the
  only path to `released` (which triggers the seller payout) and is race-guarded against a
  simultaneous dispute report via a conditioned DB update on the prior `escrow_status` value.
- A buyer can still report a delivery problem up to 7 days **after** confirming delivery.
- Disputes surface in the admin queue; an admin resolves as `released` or `refunded` (the
  latter triggers a real Paystack refund of the original charge — see §3), which also writes
  an entry to the `transaction_record_events` audit trail.
- Cart is **device-local only** (`localStorage`, no server table) — a real server `order` row
  is only created at checkout, one per line item.

### Chat / messaging — ✅ working, polling (not real-time)
- `conversations`/`messages` tables, one conversation per (buyer, seller) pair, enforced by a
  unique constraint. `Thread.jsx` polls every 4 seconds — no websockets, no Supabase Realtime.
- Message length capped at 2000 characters. No keyword moderation on chat content (the
  moderation-rules system only applies to listing text).

### Admin functionality — ✅ working, scoped roles
- Five admin sub-roles: `super_admin` (everything), `verification_admin`,
  `moderation_admin`, `finance_admin`, `support_admin` — each mapped to a fixed permission
  domain (`lib/adminRolesLevels.ts`). Every admin route requires both the right permission
  **and** a fresh step-up "unlock" (see §7).
- Confirmed real capabilities: seller approve/reject/suspend, seller verification review,
  product moderation + buyer-report resolution, moderation-rule and category CRUD,
  boost-plan/subscription-plan CRUD, platform fee configuration, manual payout settlement,
  dispute resolution (refund or release), support-ticket answering, platform-wide broadcast
  announcements, user suspend/reactivate/lookup, admin promote/demote (super-admin only, with
  self-demotion and last-super-admin-demotion both blocked), real platform analytics
  (date-bucketed GROUP BY over orders/users/sellers, not mock numbers), seller risk signals
  (real dispute-rate ranking, minimum 3 orders before a rate is shown), an aggregated alert
  center, and a full admin action audit log.
- Admin console UI: `AdminQueue.jsx` (2,856 lines — every tab) + `AdminLogin.jsx` (the
  step-up screen).

### Image storage — ✅ working
Supabase Storage, two buckets (see §4 for details): `product-images` (public) and
`seller-verification` (private, served only via 10-minute signed URLs). Real content-type
sniffing, server-generated filenames, 5 MB cap, no resizing pipeline.

### Reviews / ratings — ✅ working, two parallel layers
- The original signal (`orders.reviewed`/`my_rating`/`review_comment`) is what every seller
  rating aggregate in the app actually reads — written once by the buyer, only after
  `Delivered`, one per order.
- A newer `reviews` table makes that same review **publicly listable** and lets the seller
  **reply** to it (500-char cap) — layered on top, additive, never a second source of truth
  for the rating number itself.

### Notifications — ✅ working, in-app only
In-app `notifications` table + bell screen. **No push notifications of any kind** — no
service worker, no Web Push/FCM/APNs — despite PWA icon assets existing in the repo. Admin
broadcasts and the alert center both ride this same mechanism; there's no separate delivery
channel.

### Payments / Paystack — ✅ working (see §3 for full detail)
Real Paystack-backed checkout for marketplace orders, listing boosts, and both subscription
tracks; real webhook-driven confirmation; real seller payouts and buyer refunds.

### Other implemented features
- **AI assist (Google Gemini, optional)**: buyer request classification
  (free text → structured title/category/budget) and seller product-description generation.
  Both rate-limited, both no-op gracefully without `GEMINI_API_KEY`.
- **Subscriptions** (`lib/subscriptions.ts`, 1,223 lines): the full Store-plan and
  FindIt-Pro-plan machinery — trial tracking (with trial-abuse prevention via
  cancel-then-resubscribe detection), lazy expiry (correctness never depends on the cron
  running), live MRR/churn numbers for the admin overview.
- **Public transaction verification** (`lib/transactionRecord.ts`): every order that reaches
  `released` gets a permanent, shareable `FI-XXXXXXXX` code anyone can look up at
  `/verify/[code]` — shows seller name/verification level/order status/timeline, deliberately
  **excludes** buyer identity and the amount. Append-only event log for
  disputes/refunds/admin corrections, kept separate from the mutable `orders` row.
- **Support tickets** (`lib/support.ts`): real threaded tickets (not a mailto link); priority
  is decided once, at creation, from the filer's plan at that moment (FindIt Pro, or a
  priority-support Store plan) and never recomputed later.
- **Store slugs** (`lib/storeSlug.ts` + `store_slug_aliases` table): permanent storefront
  URLs — every slug a store has ever used keeps resolving, even after a rename, so a shared
  link never breaks.

---

## 3. Payment System (Paystack)

Paystack is the sole payment processor, used for four distinct kinds of checkout: marketplace
**orders**, listing **boosts**, **Store plan** subscriptions, and **FindIt Pro** subscriptions.
All four share the same pattern and the same underlying library (`lib/paystack.ts`).

### How Paystack is integrated

`lib/paystack.ts` is a thin, hand-written `fetch` wrapper around Paystack's REST API — no
Paystack SDK dependency. It distinguishes two failure modes on purpose, because they need
different handling:
- **`PaystackNetworkError`** — the HTTP request itself never got a response (the connection
  dropped). Paystack may or may not have actually processed the request server-side before
  the drop — this is an *unconfirmed* outcome, never safe to treat as a definite failure
  (matters most for payouts — see below).
- **`PaystackRejectedError`** — Paystack answered with a real rejection (bad email, amount
  too small, business account not live-ready, etc.). This is a *confirmed* "no," and its
  message is written by Paystack to be shown to whoever is checking out — `lib/errors.ts`'s
  shared `toClientError()` has a dedicated branch that passes this message straight through
  to the client (as a 502) instead of collapsing it into a generic "something went wrong,"
  specifically so a real, actionable rejection reason is never hidden from the person paying.

`isPaystackConfigured()` (just checks whether `PAYSTACK_SECRET_KEY` is set) gates every
payment-capable code path — with no key, the app runs in a safe degraded mode: Free/trial
plan changes still apply instantly with no payment, and anything that genuinely needs money
reports "payments aren't set up in this environment yet" instead of ever pretending to charge
someone. An admin can still manually grant a plan (`POST /api/admin/subscriptions/grant`) in
that case.

### Payment initialization flow

Each of the four checkout routes
(`app/api/orders/[id]/pay`, `app/api/products/[id]/boost`, `app/api/me/subscription`,
`app/api/sellers/me/subscription`) follows the identical sequence:

1. Auth + ownership check, then a specific business-rule check (order not already paid,
   listing active, plan actually requires payment, etc.).
2. A rate-limit check (10 checkout attempts / hour per user).
3. A **double-click guard**: look for an existing `payments` row for the same thing
   (same order / same listing+plan / same subscription) that's still `pending` and less than
   15 minutes old. If found, refuse with "you already have a checkout in progress" — this is
   what stops a double-click (or a slow retry) from creating two Paystack sessions, and
   someone completing both, for the same purchase.
4. Insert a `payments` row with `status: "pending"` **before** calling Paystack, carrying a
   unique `findit_<kind>_<uuid>` reference.
5. Call `initializeTransaction()` — Paystack's `/transaction/initialize`, with the buyer's
   real email if on file, or a synthetic one generated from their phone number
   (`<digits>@shopwithfindit.com`) if not, since Paystack requires *some* syntactically valid
   email on every transaction. (This fallback domain matters: an earlier version used
   `@findit.local`, which Paystack's live API rejects outright as not a valid email —
   fixed in commit `075c73e`. Never reintroduce a non-public-TLD fallback domain here.)
6. **If step 5 throws**: the pending row from step 4 is updated to `status: "failed"` (with
   the error recorded in `metadata.initError`) before re-throwing. This matters —
   without it, a failed `initializeTransaction()` call would leave a `pending` row sitting
   there that the double-click guard in step 3 would then use to block the user's *next*
   retry for 15 minutes, even though no real checkout session ever actually started. This was
   a real bug, fixed in the same commit as the email-domain fix above; don't reintroduce it if
   refactoring any of these four routes.
7. On success, the response carries Paystack's hosted checkout URL (`checkoutUrl`); the
   client redirects there. **The order/boost/subscription is never activated by this route's
   own response** — only step 8 below (the webhook) does that.

### Transaction verification

The webhook (next section) never trusts its own payload's amount/status fields blindly —
on a `charge.success` event it calls `verifyTransaction()` (Paystack's
`/transaction/verify/:reference`) and only proceeds if Paystack's own verify call confirms
`status === "success"` **and** the amount matches the `payments` row exactly. This is
Paystack's own recommended pattern and is cheap insurance against a forged or stale webhook
payload.

### Webhooks / callbacks

`POST /api/payments/paystack/webhook` (`app/api/payments/paystack/webhook/route.ts`) is the
**only** place any order, boost, or subscription is ever actually activated/marked paid —
never any checkout route's own response, never anything client-supplied.

- **Signature verification is the entire auth model** for this endpoint (there's no session —
  Paystack calls it, not a browser): the raw request body is HMAC-SHA512'd with
  `PAYSTACK_SECRET_KEY` and compared (timing-safe) against the `x-paystack-signature` header.
  No valid signature → `401`, nothing processed. If `PAYSTACK_SECRET_KEY` isn't set at all,
  the webhook refuses everything rather than processing unverifiable requests.
- **Idempotency / safe redelivery**: Paystack can and does redeliver the same webhook event.
  The payment row is claimed exactly once via a conditioned update
  (`.eq("id", payment.id).neq("status", "success")`) — only the delivery that actually flips
  the row to `success` proceeds to apply side effects; a concurrent or later redelivery of
  the *same* event is a no-op. Separately, if a *side effect* (order confirmation, boost
  activation, subscription change) fails even though the payment itself was already recorded
  as `success`, the route returns a non-2xx so Paystack retries — and the `payment.status ===
  "success"` branch at the top of the handler specifically re-attempts just the side effect
  on that retry, without re-applying the payment itself. This closes a real class of bug:
  "buyer was charged, but the order/boost/plan never actually updated, with no way to
  recover" — see the inline comments in the route for the full reasoning.
- Routes to three outcomes depending on `payments.kind`/`order_id`:
  `confirmOrderPayment()` (orders, `lib/payments.ts`), `activateBoost()` (boosts,
  `lib/boosts.ts`), or `changeStorePlan()`/`changePlatformSubscription()` (subscriptions,
  `lib/subscriptions.ts`, called with `paymentConfirmed: true`).
- On `charge.failed`, the payment row and (if applicable) the order's `payment_status` are
  flipped to `failed`, and a past-due subscription is marked as such.

**You must configure the webhook URL in the Paystack dashboard** for any of this to work —
see §3's deployment subsection below.

### Order/payment status flow

```
payments.status:    pending ──────► success              (webhook, charge.success + verified)
                        │                │
                        └──► failed      └──► (order_id set?) confirmOrderPayment()
                                               (kind='boost'?) activateBoost()
                                               (else)          changeStorePlan / changePlatformSubscription

orders.payment_status:  pending ──► paid         (confirmOrderPayment, ONLY place this ever happens)
orders.escrow_status:   unpaid ──► held ──► released ──► (nothing further)
                                      │          └──► refunded (admin-resolved dispute)
                                      └──► disputed (buyer reports an issue)
```

`confirmOrderPayment()` is deliberately the **only** function in the codebase that ever marks
an order `paid` — it also snapshots the platform fee (bps + computed amounts) at that exact
moment, frozen forever after, so a later fee-config change can never retroactively rewrite
what an already-paid order's numbers were.

Seller payouts (`initiateSellerPayout()`, triggered by the buyer confirming delivery →
`escrow_status: released`) are a *second*, separate real-money movement — a Paystack Transfer
to the seller's bank account, gated on the seller having added payout bank details
(`resolveAccountNumber` + `createTransferRecipient`, one-time per seller). If Paystack isn't
configured, or the seller has no payout account, or the transfer's outcome can't be confirmed
(a `PaystackNetworkError` — see above), the payout is recorded as `manual_required` rather
than guessed at — an admin settles it off-platform and marks it paid
(`POST /api/admin/payouts/[id]`). This deliberately never risks a double payout from treating
an unconfirmed transfer as a confirmed failure.

Refunds (`refundOrderPayment()`, `lib/payments.ts`) reverse the buyer's original Paystack
charge for real — not just a local status flip — and explicitly refuse if a payout for that
order has already been paid or is processing (to avoid paying out *and* refunding the same
order), surfacing that conflict to the admin instead of guessing.

### Environment variables required

Only one is strictly payments-specific:

| Variable | Required? | Purpose |
|---|---|---|
| `PAYSTACK_SECRET_KEY` | Optional, but required for any real payment to work | Paystack secret API key. Powers all four checkout flows, webhook signature verification, payouts, and refunds. Absent, the app degrades to "payments not configured" everywhere rather than faking success. |

(`CRON_SECRET` is also relevant here since the daily cron sweeps boost/subscription expiry —
see §5/§6 — but isn't Paystack-specific.)

### How to safely configure Paystack in a new deployment

1. Create (or log into) a Paystack account at `https://dashboard.paystack.com`.
2. **Settings → API Keys & Webhooks** — copy the **secret key**. Use the **test** secret key
   while developing; only switch to the **live** secret key once you intend to accept real
   money. **Never commit this key anywhere** — it only ever goes into an environment
   variable (`.env.local` locally, a Vercel project environment variable in production/
   preview — see §6), never into code, never into this documentation, never into a commit
   message.
3. Set `PAYSTACK_SECRET_KEY` as an environment variable in your deployment platform (and in
   `.env.local` for local development).
4. In the same Paystack dashboard screen, add a **webhook URL**:
   `https://<your-production-domain>/api/payments/paystack/webhook`. Without this step,
   checkout sessions will complete on Paystack's side but **nothing in FindIt will ever mark
   the order/boost/subscription as paid** — this is the single most common way a "payment
   worked on Paystack but nothing happened in the app" report happens.
5. Deploy. The app automatically starts making real calls the moment
   `PAYSTACK_SECRET_KEY` is present — no code changes needed.
6. Before accepting real live-key payments, confirm the Paystack business account itself has
   completed Paystack's own business verification — a live key on an unverified business
   account produces exactly the kind of rejection `PaystackRejectedError` surfaces (and did,
   during this project's own live testing).

**Do not expose the secret key to the client.** It's read only in server-side `lib/`/`app/api`
code (never anything under `NEXT_PUBLIC_`), and it must never appear in a response body, a
log line visible to users, or a committed file.

---

## 4. Database

Full table-by-table reference, relationships, RLS policy audit, storage buckets, and the
complete migration history live in **[`DATABASE.md`](./DATABASE.md)**. Summary here:

- **34 tables**, all Postgres, all on the one Supabase project. Core flow:
  `users → sellers → products/offers` · `requests → offers → orders` ·
  `orders → payments/payouts/escrow → transaction_records → transaction_record_events` ·
  `orders → reviews`. Subscriptions attach to either a seller (Store plan) or a user
  (FindIt Pro) via an untyped `owner_type`/`owner_id` pair — the one place the schema
  deliberately skips a literal foreign key, since it targets two different parent tables.
- **⚠️ `supabase/schema.sql` is currently stale** — it was not updated for 7 migrations
  (021, 022, 025, 026, 027, 028, 029), so it's missing the `rate_limits`, `reviews`,
  `moderation_rules`, and `product_reports` tables, the `product_images` table, 7 columns on
  `products`, several money-integrity constraints, and the `check_rate_limit()` function.
  **The real, current schema = `schema.sql` + every file in `supabase/migrations/` applied in
  order (002 through 033).** See §8 (Known Issues) — this needs a cleanup pass, but is a
  documentation/onboarding risk, not a runtime bug (the live database already has everything;
  only the hand-maintained mirror file is behind).
- **Row Level Security is enabled on every single table, with zero `CREATE POLICY` statements
  anywhere in the codebase.** This is intentional, documented defense-in-depth — see §7 for
  why this is safe given the app's architecture, and why it would *not* be safe to start
  using the anon/public Supabase key anywhere without first writing real policies.
- **Storage buckets** (created lazily by `lib/storage.ts`, not pre-provisioned in SQL):
  - `product-images` — **public**, listing photos, served via plain public URLs.
  - `seller-verification` — **private**, verification evidence, served only via short-lived
    (10-minute) signed URLs; the storage layer itself does no authorization, callers must
    check ownership/admin status first.
- **One SQL function**: `check_rate_limit(key, max, window_seconds)` — an atomic
  check-and-increment backing `lib/rateLimit.ts`'s shared, cross-serverless-instance rate
  limiter. **No triggers** anywhere.
- A recurring, deliberate schema pattern worth knowing about before touching any of these
  tables: several (`products`, `orders`, `offers`) carry **both** a legacy free-text `seller`
  name column **and** a nullable `seller_id` foreign key — an in-progress, additive migration
  toward reliable identity (migration 009) that is not yet the sole source of truth anywhere.
  Don't assume `seller_id` is always populated.

---

## 5. Environment Variables

The authoritative, fully-commented list is **[`.env.example`](./.env.example)** — copy it to
`.env.local` and fill in real values there (`.env.local` is gitignored). The table below is a
quick-reference; see `.env.example` for the full reasoning behind each one. **No actual
values are reproduced here or anywhere in this documentation.**

| Variable | Required? | Purpose |
|---|---|---|
| `SUPABASE_URL` | **Required** | Supabase project REST/base URL — builds both the DB client (`lib/db.ts`) and the storage client (`lib/storage.ts`). |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required** | Supabase service-role key — full DB/storage access, bypasses RLS entirely (see §7). Never expose client-side. |
| `GEMINI_API_KEY` | Optional | Google Gemini key for AI request classification + description generation. Both features cleanly report "not configured" without it. |
| `TERMII_API_KEY` | Optional | Sends OTP SMS for signup/password-reset. Unset → phone verification is skipped entirely, app still fully works. |
| `TERMII_BASE_URL` | Optional | Overrides Termii's API base URL (defaults to `https://v4.api.termii.com`). |
| `TERMII_SENDER_ID` | Optional | Termii SMS sender ID (defaults to Termii's shared sender). |
| `OTP_EXPIRY_MINUTES` | Optional (default 10) | How long an OTP code stays valid. |
| `OTP_RESEND_COOLDOWN_SECONDS` | Optional (default 60) | Minimum gap between OTP resend requests. |
| `OTP_MAX_ATTEMPTS` | Optional (default 5) | Max verification guesses per OTP code. |
| `OTP_MAX_REQUESTS_PER_HOUR` | Optional (default 5) | Max new-OTP requests per phone/purpose/hour. |
| `OTP_MAX_RESENDS` | Optional (default 3) | Max resends of one pending code. |
| `PAYSTACK_SECRET_KEY` | Optional, but required for real payments | See §3. |
| `ADMIN_UNLOCK_MINUTES` | Optional (default 60) | How long the admin step-up "unlock" lasts before an admin must re-enter their password. |
| `APP_URL` | Optional | Public origin used to build absolute, shareable storefront URLs (Open Graph, WhatsApp share links). Falls back to Vercel's own URL vars, then a relative path. |
| `CRON_SECRET` | Optional, but strongly recommended in production | Bearer-token secret Vercel Cron signs its request with, checked by `/api/cron/expirations` so only Vercel's scheduled job (not an arbitrary caller who finds the URL) can trigger the daily expiry sweep. **Currently set in this project's production Vercel environment.** |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional | Sentry project DSN (public identifier, not a secret — intentionally client-exposed). Unset → errors just log to console/Vercel logs instead of being collected. |

**Platform-injected — never set these manually**: `VERCEL_PROJECT_PRODUCTION_URL`,
`VERCEL_URL`, `VERCEL_ENV`, `NEXT_PUBLIC_VERCEL_ENV` (all set automatically by Vercel; used as
fallbacks for `APP_URL` and as the Sentry environment tag), `NEXT_RUNTIME` (set by Next.js
itself), `NODE_ENV` (standard Node flag — also controls whether the session cookie gets the
`secure` attribute).

---

## 6. Deployment

### How the project is deployed

- **Hosting**: Vercel, project `findit` (ID `prj_atC3wG0zvFHEzyuiOTk0Spz3eTkk`, team
  `virt-technologies` / `team_ldJA8ISPIxTDoYglXjscTW5p`).
- **Source**: GitHub repo `jherrm1ah/Findit-`, connected via Vercel's GitHub integration.
  Every push to `main` triggers a production deployment automatically; other branches deploy
  as preview environments.
- **Production domain**: `shopwithfindit.com` (custom domain mapped to the Vercel project).
- **Database**: Supabase project `lhbekblecppamgmvmumo`.

### Vercel configuration

- `vercel.json` defines one cron job: `GET /api/cron/expirations` daily at 09:00 UTC (sweeps
  expired boosts/subscriptions — see §2).
- `next.config.mjs` sets security headers for every response (CSP, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, HSTS, a locked-down `Permissions-Policy`), disables the
  `X-Powered-By` header, allows Next's `<Image>` to load from `*.supabase.co`, and forces
  `Cache-Control: no-store` on every `/api/*` response (this app serves session-scoped data,
  including on shared devices — nothing under `/api/*` should ever be cached).
- No `middleware.ts` exists — all auth/rate-limiting enforcement happens per-route, not via
  Next middleware.
- Environment variables are set per-environment (production/preview/development) in the
  Vercel project's settings — see §5 for the full list. **A newly pushed environment variable
  only takes effect on the next deployment**, not retroactively on an already-running one.

### Supabase configuration

- Run `supabase/schema.sql` against a fresh project, then apply every file in
  `supabase/migrations/` **in numeric order** (002 through 033 — see §4's note on
  `schema.sql` currency; don't skip any, and don't rely on `schema.sql` alone for a
  from-scratch setup without double-checking against the migrations list in `DATABASE.md`).
- No Supabase Auth setup needed or used.
- No storage buckets need pre-creating — `lib/storage.ts` creates `product-images` and
  `seller-verification` on first use.
- Get the project's `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from
  **Settings → API** in the Supabase dashboard.

### Steps for deploying a fresh version (new environment, e.g. staging)

1. Create a new Supabase project. Run `supabase/schema.sql`, then every migration in
   `supabase/migrations/` in order.
2. Create a new Vercel project (or a new environment on the existing one) pointed at the
   `jherrm1ah/Findit-` repo.
3. Set every environment variable from §5 that applies to this environment (at minimum
   `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; add `PAYSTACK_SECRET_KEY` with a **test**
   key for staging, never a live key, unless this environment is meant to take real money).
4. If this environment should run the daily cron sweep, generate and set `CRON_SECRET`
   (e.g. `openssl rand -hex 32`).
5. Deploy. Confirm `GET /api/auth/me` returns `{ user: null }` (not an error) as a basic
   smoke test that the DB connection and env vars are correctly wired.
6. If this environment needs real Paystack checkout, add its own webhook URL
   (`https://<this-environment's-domain>/api/payments/paystack/webhook`) in the Paystack
   dashboard — **webhook URLs are per-Paystack-account, not per-deployment**, so a staging
   environment sharing the production Paystack account needs its own webhook entry, or
   use Paystack's separate test-mode account instead.
7. Run `npm run build` locally against the same env vars before trusting a deploy — `tsc`
   type-checking happens implicitly during `next build`, and there's no separate
   `typecheck` script.

---

## 7. Security

### Authentication / session security
- Session cookie `findit_session`: `httpOnly`, `SameSite=Lax`, `secure` in production, 30-day
  expiry, opaque 256-bit random token (not a JWT) stored in a `sessions` table — revocable
  server-side by row deletion.
- Passwords: `crypto.scryptSync` + random per-user salt; `crypto.timingSafeEqual` comparison;
  a dummy-salt hash on the "no such account" path specifically to prevent timing-based
  account enumeration between "unknown phone" and "wrong password."
- OTP codes: HMAC-SHA256-hashed with a random per-record salt (never stored in plaintext),
  compared timing-safe. The 6-digit space (1M values) isn't brute-force-resistant on its own
  by design — the real protection is expiry + atomic per-attempt rate limiting + hourly
  request caps + resend caps, all DB-enforced.
- No CSRF token mechanism exists. Mitigated instead by `SameSite=Lax` cookies + a strict CSP
  (`form-action 'self'`, no cross-origin script sources) + `no-store` on all `/api/*`
  responses. This is a single-layer defense, not a token-based backstop — see §8.
- Password reset/change destroys all *other* sessions on success (so a stolen session can't
  survive a password change); a no-current-password reset destroys *all* sessions.

### Admin access control
- Five scoped roles (`super_admin`/`verification_admin`/`moderation_admin`/`finance_admin`/
  `support_admin`), each mapped to a fixed permission domain — no implicit super-admin
  fallback for a null/unrecognized role.
- A second, time-boxed **step-up "unlock"** layer sits in front of every admin route: a
  session with `role === "admin"` is *not* sufficient — `sessions.admin_unlocked_at` must be
  fresher than `ADMIN_UNLOCK_MINUTES` (default 60), re-verified via a password re-entry
  screen, independent of the 30-day session lifetime. Missing this returns a distinct 403
  (`admin_unlock_required`) so the client shows a step-up prompt rather than discarding the
  whole session.
- Granting/revoking admin access is super-admin-only; an admin can never self-demote, and the
  last remaining super-admin can never be demoted (self-lockout prevention).
- **Fails closed**: if the unlock-tracking column is somehow missing (e.g. a migration not
  applied), admin access is denied outright rather than defaulting open.

### Supabase RLS — read this before assuming RLS protects anything
Every table has RLS **enabled**, and there are **zero** `CREATE POLICY` statements anywhere
in this codebase. This is deliberate and documented at the top of `supabase/schema.sql`: the
app's one and only database client always uses the **service-role key**
(`lib/db.ts#getDb()`), which bypasses RLS unconditionally. **The real, and only,
authorization boundary is the Next.js API route layer** — every route does its own
`getSessionUser()` → ownership check → business-rule check, consistently, by hand-written
convention (not a shared middleware or schema-validation library). RLS being enabled with
zero policies is pure defense-in-depth: if the anon/public key were ever accidentally used or
leaked somewhere, it would be denied everything by default, since an empty policy set means
deny-all. **Do not treat RLS policies as a safety net here, and never add a client-side
Supabase call without first writing real RLS policies for whatever it touches** — right now,
nothing in the codebase needs them because nothing client-side ever uses that key.

### Paystack secret-key handling
Read only in server-side code (`lib/paystack.ts`), never under a `NEXT_PUBLIC_` prefix, never
logged, never returned in a response body. See §3 for the full payment-security model
(webhook HMAC verification, idempotent redelivery handling, confirmed-vs-unconfirmed failure
distinction for payouts).

### API protection
Consistent pattern across essentially every route (not a shared middleware, but a repeated,
disciplined convention): `getSessionUser(req)` → 401 if absent → an ownership check specific
to the resource (via `sellerIdentityMatch.ts` rather than a naive string match, since seller
business names aren't unique) → hand-written field-by-field input validation (no schema
library like zod) → a business-rule guard (e.g. "a suspended seller can still self-takedown a
listing but not reactivate one") → `errorResponse()` (`lib/errors.ts`), which turns an
intentional `ValidationError` into a safe, specific client message and collapses everything
else into a generic one (logged + reported to Sentry server-side, never leaking internals
like query fragments or column names to the client).

### File upload validation
`lib/storage.ts` + `app/api/uploads/route.ts`: session + rate limit (20 uploads/15 min/user)
→ declared MIME type + size checked (5 MB cap, jpeg/png/webp/gif only) → **real magic-byte
content sniffing** against the declared type (explicitly defends against a spoofed
`Content-Type` header, not just trusting the client) → a server-generated filename always
(never the client's original filename — closes path-traversal and double-extension tricks).
No resizing/transformation at upload time. The private verification-evidence bucket does no
authorization itself by design — callers are responsible for checking ownership/admin status
before requesting a signed URL.

### Rate limiting
`lib/rateLimit.ts` — the real limiter is an atomic, shared Postgres counter
(`check_rate_limit()` RPC, migration 022), immune to serverless cold-starts/multi-instance
races. A per-instance in-memory fallback exists only if that RPC call itself throws, and is
bounded (50,000 entries, fails *closed* once full) to prevent memory-exhaustion DoS. Applied
to every genuinely sensitive route: login, signup, OTP send/resend/verify, password
reset/change, uploads, messages, product reports, AI generation, order/boost/subscription
checkout, requests/offers, support tickets, admin broadcast, admin session unlock. A handful
of lower-sensitivity, already-session-gated profile-edit routes (phone/business-name/become-
seller/name/avatar/notifications) don't call it — see §8.

### Known/observed security concerns
See §8 (Known Issues) for the full, prioritized list — nothing below is speculative, all of
it was confirmed by reading the actual code:
- `GET /api/products` is unauthenticated and fully unbounded (no pagination/limit) — a real
  resource-exhaustion surface as the catalog grows.
- A few authenticated profile-edit routes have no rate limit (low severity — session-gated,
  not a credential-guessing surface, but inconsistent with the discipline applied elsewhere).
- No explicit CSRF token backstop beyond `SameSite=Lax` + CSP.
- `CRON_SECRET` is optional by design (fine for local dev) but should be treated as
  **required** in any public production deployment — it already is set in this project's
  production environment.

---

## 8. Known Issues

### Critical (should be addressed soon)
*None found that affect correctness of money movement, auth, or data integrity in
production today.* The payment/escrow/refund/payout state machine, admin access control, and
upload validation were all read in detail and are deliberately and carefully hardened (see
the extensive inline comments throughout `lib/payments.ts`, `lib/auth.ts`,
`lib/adminRoles.ts`, and the Paystack webhook route — nearly every non-obvious decision is
explained at the point it's made).

### Important (worth scheduling, not urgent)
1. **`supabase/schema.sql` is stale** — missing 7 migrations' worth of tables/columns/
   constraints/the rate-limit function (see §4). The live database is correct; only the
   hand-maintained mirror file has drifted. This is a real onboarding/handover risk (a new
   developer reading `schema.sql` alone would get an incomplete picture) and should be
   regenerated from the real project (e.g. via a Supabase schema dump, or by folding in the
   missing migrations by hand) as a dedicated, carefully-reviewed pass — **not** done as part
   of this documentation task, per the instruction not to make unnecessary code changes while
   writing it.
2. **`GET /api/products` has no pagination** — returns the entire product catalog on every
   call, unauthenticated. Fine at the current catalog size; will become a real latency and
   cost problem as listings grow into the thousands. Needs server-side pagination (and
   eventually, real search) before that happens.
3. **Search/category/geo filtering is entirely client-side** — works today because the whole
   catalog is fetched anyway (see #2), but the two issues are really the same underlying
   limitation and should be solved together: server-side filtering/pagination/search.
4. **A handful of authenticated profile-edit routes have no rate limit** (phone,
   business-name, become-seller, name, avatar, notifications). Low severity today since
   they're all session-gated with no credential-guessing surface, but inconsistent with the
   rate-limiting discipline applied everywhere else — cheap to fix by adding the same
   `checkRateLimit` call already used elsewhere.
5. **No CSRF token mechanism** — relies entirely on `SameSite=Lax` + CSP. Adequate for
   current, modern-browser-only usage; worth an explicit decision (document it as sufficient,
   or add a token) rather than leaving it implicit.

### Optional (nice-to-have, not urgent, don't add scope for its own sake)
6. **No image resizing/thumbnailing pipeline** — uploads are stored and served at original
   resolution; Next's `<Image>` resizes at render time only, not storage. Could reduce
   storage/bandwidth cost at scale, but isn't broken today.
7. **No push notifications** — in-app only, despite PWA icon assets existing in the repo.
   Only worth building if users actually ask for it; the PWA icons alone aren't evidence this
   was meant to exist yet.
8. **`seller`/`seller_id` dual-tracking** (`products`, `orders`, `offers`) is a real,
   in-progress identity migration (migration 009) that was never finished — not a bug, but
   worth eventually completing (backfill + drop the legacy text column) rather than carrying
   both forever. `app/api/admin/seller-identity` already exists as the investigation/backfill
   tool for exactly this.
9. **In-memory rate-limit fallback degrades silently** if the Postgres `check_rate_limit()`
   RPC is ever unavailable in some environment (e.g. migration 022 not applied there) — it's
   logged loudly when it happens, but a deployment checklist item ("confirm migration 022 is
   applied") would catch this before it's ever needed.

---

## 9. Next Steps

Prioritized, and deliberately **not** padded with features nobody asked for:

1. **Regenerate `supabase/schema.sql`** so it's a true mirror of the live schema again (see
   Known Issues #1). Low risk, pure documentation accuracy, but needs a careful, dedicated
   pass — diff every migration from 021 onward against the file by hand or via a real schema
   dump, don't eyeball it.
2. **Add pagination to `GET /api/products`**, and move basic filtering (category, price
   range, search text) server-side. This is the most consequential unaddressed item — it's
   currently masked by catalog size, not actually fixed, and the fix gets harder to retrofit
   the longer client code assumes it has the full array in memory.
3. **Add rate limiting to the remaining unguarded profile-edit routes** (Known Issues #4) —
   small, mechanical, consistent with the existing pattern.
4. **Make an explicit decision on CSRF** (Known Issues #5) — either document
   `SameSite=Lax` + CSP as the deliberate, sufficient answer, or add a token-based check.
   Either is fine; leaving it unexamined is the only wrong answer.
5. **Finish or formally park the `seller_id` identity migration** (Known Issues #8) — decide
   whether to backfill the remaining legacy-text-only rows and drop the dual-tracking, or
   intentionally leave both columns forever (e.g. if the text column is still load-bearing
   somewhere undiscovered) and document that decision so a future developer doesn't "finish"
   it by accident and break something.
6. Everything in the "Optional" tier of §8 (image resizing, push notifications) — only pick
   these up if there's an actual signal (cost, user complaints) that they're needed, not
   speculatively.

---

## 10. Developer Handover

### Where things live

| Path | What's there |
|---|---|
| `app/page.tsx` | The one real entry point — renders `<App />`, the entire SPA. |
| `app/api/**/route.ts` | Every backend endpoint (99 files). Grouped by feature under `admin/`, `auth/`, `orders/`, `products/`, `requests/`, `sellers/`, `support/`, `payments/`, etc. Each file is small — auth + validation + a call into the matching `lib/` module, then `errorResponse()` on failure. |
| `app/store/[slug]/`, `app/verify/[code]/` | The two real, server-rendered, crawlable public pages outside the SPA (storefront, transaction verification). |
| `lib/*.ts` | The actual backend logic, one module per domain. **Start here**, not in `app/api`, to understand what any feature actually does — `lib/repo.ts` is the largest/central one (products, orders, offers, notifications, saved items, conversations/messages); everything else is feature-specific (`lib/payments.ts`, `lib/subscriptions.ts`, `lib/boosts.ts`, `lib/support.ts`, etc.) |
| `lib/*.test.ts` / `lib/*.integration.test.ts` | Co-located Vitest suites — unit tests for pure logic, "integration" tests that exercise real `lib/repo.ts`/`lib/payments.ts` flows against an in-memory fake Supabase client (`lib/testing/fakeSupabase.ts`), no real DB or network involved. Run with `npm run test`. |
| `components/findit-app/` | The entire client-side React app. `App.jsx` (top-level auth/splash shell) → `MainApp.jsx` (1,879 lines — the screen-switcher + bottom tab bar) → ~25 individual screen components (`Home.jsx`, `Browse.jsx`, `SellerDashboard.jsx`, `AdminQueue.jsx` at 2,856 lines, etc.). `api.js` is the one shared fetch wrapper every screen uses to call `/api/*`. |
| `supabase/schema.sql` + `supabase/migrations/` | The database. **Read §4's note on `schema.sql` staleness before trusting it alone** — the migrations folder (numeric order, 002–033) is the real source of truth for anything schema.sql might be missing. |
| `.env.example` | The authoritative environment variable reference — always check this first, it's kept current and heavily commented. |
| `vercel.json` | The one piece of infra-as-code: the daily cron job definition. |
| `next.config.mjs` | Security headers, CSP, image remote patterns, the global `/api/*` no-cache rule. |
| `scripts/create-admin.mjs`, `scripts/check-schema.mjs` | Standalone Node utility scripts (not part of the Next.js build) — creating the first admin account, and sanity-checking the live DB schema against expectations. |
| `docs/BUILD-SPEC.md`, `docs/IMPLEMENTATION-PLAN.md` | Historical product spec + build audit from an earlier phase. Useful background, **not** kept current — this file is. |

### How to actually work on this codebase

```
npm install
cp .env.example .env.local   # fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY at minimum
npm run dev                  # http://localhost:3000
npm run test                 # vitest — unit + integration tests, no real DB needed
npm run lint                 # next lint
npm run build                # next build — this is also where TypeScript gets type-checked (no separate typecheck script)
```

Before considering any change done, this codebase's own established discipline (visible
throughout the commit history and inline comments) is: `npx tsc --noEmit` →
`npx vitest run` → `rm -rf .next && npx next build` clean → only then commit/push. For
anything touching money (payments, payouts, refunds, escrow) or auth/admin access, read the
surrounding inline comments carefully first — almost every non-obvious decision in those
areas is deliberately explained in a comment at the point it's made, specifically so a future
developer doesn't "simplify" away a real fix for a real bug that was already found and
closed once (the Paystack email-domain and dangling-pending-payment fixes referenced in §3
are a recent, concrete example of exactly that pattern).

### What a new developer should read first, in order
1. This file, start to finish.
2. [`DATABASE.md`](./DATABASE.md) for the full schema.
3. `lib/repo.ts`, then `lib/auth.ts` and `lib/adminRoles.ts` — the three modules almost
   everything else depends on.
4. `lib/paystack.ts` + `lib/payments.ts` + `app/api/payments/paystack/webhook/route.ts`
   together, if touching anything payment-related — §3 above is a guide to these three
   files, not a replacement for reading them.
5. `components/findit-app/App.jsx` → `MainApp.jsx` to understand the frontend shell before
   diving into any individual screen component.

---

## Summary

**Fully completed and working in production today**: authentication, user profiles, seller
onboarding/verification/storefronts (with real plan-gated templates/colors), product
listings (with real moderation), requests/offers, the full order escrow state machine, chat,
the entire admin console (all roles, all queues), image storage/upload validation, reviews,
in-app notifications, support tickets, public transaction verification, and — as of today —
**real, end-to-end Paystack payments** (orders, boosts, both subscription tracks, webhook
confirmation, payouts, and refunds), confirmed working with a live successful checkout.

**Production-ready**: the entire feature set above. Security posture (auth, admin step-up,
rate limiting, upload validation, RLS-as-defense-in-depth, API-layer authorization) was read
in detail and found to be deliberately and consistently hardened, not an afterthought.

**Still needs work**: nothing blocking — see §8/§9. The most consequential open item is that
search/browse is entirely client-side with an unpaginated `GET /api/products`, which is a
scaling concern, not a correctness one, at today's catalog size. `supabase/schema.sql` being
stale is a documentation/onboarding risk, not a live-data risk (the real database already has
everything from all 33 migrations).

**Most important things to protect/back up**:
- The Supabase project (`lhbekblecppamgmvmumo`) itself — this is the only copy of all
  production data (users, orders, payments, everything). Confirm Supabase's own
  backup/point-in-time-recovery settings for this project match your risk tolerance.
- The **Paystack secret key** and the **Supabase service-role key** — both grant full
  access to real money and all data respectively. Treat them like passwords: never in code,
  never in chat, never in a doc, rotated immediately if ever suspected of leaking.
- The GitHub repo (`jherrm1ah/Findit-`) — the only copy of the application code and the full
  migration history, which is itself the only complete record of how the database schema
  evolved.
- Admin access to the Vercel project and the Paystack dashboard — whoever has these can
  change environment variables (including swapping the live Paystack key) and see/change the
  webhook configuration that production payments depend on.
