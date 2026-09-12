# FindIt Naija

A request-first marketplace connecting buyers to verified sellers, starting in Nigeria and built
to scale globally: tell FindIt what you need (or browse the catalogue directly), real sellers near
you send offers, you pay into escrow and confirm on delivery.

This is a Next.js app backed by a real Supabase Postgres database and real Gemini AI classification.
There is no mock or seed data anywhere in the app — a fresh install starts genuinely empty, and
every product, order, request, offer, review, message, and notification you see was created by a
real signup, listing, or transaction. Payments are still a stub (checkout shows the escrow-held-
funds UI as a simulated state) — see "Next steps" below.

## Flows

- **Splash → Onboarding → Login/signup** on first load. Signing up picks a buyer or seller
  account; a returning user with a live session skips straight past login. A seller signup
  immediately enters the admin verification queue. There's no guest/anonymous browsing — every
  visitor logs in or creates an account before reaching the app.
- **Home** — promo banner, category shortcuts, and "New Listings" (the most recently created
  products — there's no curated "trending" concept, just real recency); a real unread-notification
  badge.
- **Browse** — every real product currently listed, across 15 fixed categories (`lib/categories.js`
  — a taxonomy, not seed data); search, filter by category/verified seller.
- **Product detail → Buy now → Checkout** — creates a real order (requires login), with a simulated
  escrow hold and a delivery-status tracker. Tap a seller's name to see their public profile.
- **Request an item** — submits a real request tied to your account (requires login). An optional
  AI-assist button (Gemini) turns your description into a suggested title/category/budget. Sellers
  see it in their dashboard and can send a real offer (their own price, delivery cost, ETA,
  warranty, note — nothing auto-filled); accept one from **My requests** to pay and track delivery.
- **My requests** — see every request you've submitted and the real offers sellers have sent,
  accept whenever one looks right.
- **Seller dashboard** — seller accounts only; everyone else sees a locked screen explaining why
  and a way to log in as one. Manage your own listings (add/edit/delete, with real photo upload),
  advance your orders through the fulfillment lifecycle, and respond to open customer requests with
  a real offer. Stats (rating, orders, listings, order value) are computed from your real order/
  listing history, not hardcoded.
- **Admin queue** — staff-only (there's no self-serve "I'm an admin" signup); see "Creating an
  admin account" below. Approve/reject pending sellers; requests with zero offers show as
  unmatched. Seller verification is currently a judgment call based on the account and phone
  number — there's no real document/ID upload system yet.
- **Account** — real order history with a live delivery-status tracker, reviews, and a real saved-
  items list (tap the heart on any product). Empty until you actually have orders/saved items.
- **Messages** — real buyer-seller chat. Tap "Contact" on a product or a seller's profile to start
  a conversation; both sides see the thread, unread counts, and can reply from their own account.
- **Seller profile (storefront)** — tap a seller's name from a product to see their public page:
  real aggregate rating (from their reviewed orders), listing count, verified status, a "Contact
  seller" button, and a grid of everything they currently have listed.
- **Notifications** — real, per-account, sent on every meaningful state change: a seller sends an
  offer, an order moves to the next fulfillment step, a seller gets a new order or a review, and a
  seller's application is approved or rejected. Mark one or all as read.
- **Profile** — shows your real name/phone/role with a working log out, plus entry points into
  your orders, requests, messages, and notifications. Tap the avatar to upload a real profile
  photo. Settings rows are real screens: **Account details** (edit name; sellers can also rename
  their business — propagated to their existing listings/orders/offers, see the note in
  `lib/auth.ts#updateSellerBusinessName`; change phone number or password, both requiring your
  current password to confirm), **Notification preferences** (a
  toggle to turn in-app notifications on/off — `notifyBestEffort` in `lib/repo.ts` checks it before
  writing any notification), **Help & support** (FAQ + a real support email), and **About FindIt**.
- **Product photos** — sellers can attach a real photo to a listing (add or edit), stored in
  Supabase Storage; falls back to a generated gradient icon for listings without one.
- **Location** — FindIt is not tied to any one city. With permission, the app uses your device's
  real coordinates to sort listings, sellers, and (for sellers) open requests by actual distance —
  "near you" works the same whether you're in Lagos, Nairobi, or anywhere else. See "Location
  awareness" below.
- **Store plans** — every seller account has a real subscription (Free by default) that actually
  gates what their store can do — currently the number of active listings, backend-enforced, not
  just hidden buttons. A "Store plan" card on the Seller Dashboard links to a plan-comparison screen
  to upgrade, start a trial, or cancel. See "Store subscriptions" below.
- **Seller trust & verification** — a multi-step wizard (business info, location, evidence, review)
  that a seller can complete any time from their dashboard, reviewed by an admin, driving a public
  New/Verified/Trusted badge on their storefront. Doesn't block selling — it's trust information for
  buyers, not a gate. See "Seller trust & verification" below.

## Stack

Next.js (App Router) + Tailwind CSS + lucide-react icons, with **Supabase Postgres** as the
database and **Gemini** for AI request classification, both accessed only from server-side API
routes under `app/api/` (never from the browser). The screen shell is one client component tree
mounted at `app/page.tsx`; screen navigation is in-memory state (`components/findit-app/App.jsx` →
`MainApp.jsx`), not URL routing. `MainApp.jsx` owns all server-backed state and passes it down as
props, with handlers that call the API and update local state.

## Running locally

### 1. Set up the database

Create a free [Supabase](https://supabase.com) project, then run `supabase/schema.sql` against it
(Supabase dashboard → SQL Editor → paste the file → Run). This creates every table the app needs.
It does **not** seed any data — a fresh database is genuinely empty on purpose.

**If you already had this app running before location support was added:** your existing project
needs one more script — `supabase/migrations/002_add_location.sql` (SQL Editor → paste → Run). It
only adds new columns (`lat`/`lng` on `users`, `products`, `requests`); it doesn't touch existing
data. A brand-new project doesn't need this — `schema.sql` already includes those columns.

**If you already had this app running before Store subscriptions were added:** run
`supabase/migrations/010_store_subscriptions.sql` (SQL Editor → paste → Run). It adds the
`subscription_plans`/`subscriptions`/`subscription_events`/`payments` tables (seeded with the real
plan prices/limits) and a `products.active` column defaulting to `true` — every existing listing
keeps showing exactly as it does today. Then also run
`supabase/migrations/011_store_branding.sql`, which adds `logo_url`/`banner_url` to `sellers` (real
backing for the plan's customization benefit — see "Store subscriptions" below). A brand-new
project doesn't need either — `schema.sql` already includes both.

**If you already had this app running before seller trust & verification was added:** run
`supabase/migrations/012_seller_verification.sql`, which adds `email` to `users`; seller-type/
category/description/location/verification-status columns to `sellers`; and two new tables,
`seller_verification_details` and `seller_verification_evidence` (see "Seller trust &
verification" below). Nothing existing changes — every seller's `verification_status` starts at
`'incomplete'`, the same as a freshly signed-up one. A brand-new project doesn't need this —
`schema.sql` already includes it.

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in:

- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — Settings → API in your Supabase project. The
  service role key has full access to your database; it's used server-side only and is never sent
  to the browser.
- `GEMINI_API_KEY` — from [ai.google.dev](https://ai.google.dev) ("Get API key"). Optional: without
  it, everything else works, and the AI-suggest button on the request form shows a clear error
  instead of a fake response.
- `PAYSTACK_SECRET_KEY` — from [dashboard.paystack.com](https://dashboard.paystack.com) (Settings →
  API Keys & Webhooks; use the TEST key while developing). Optional: without it, Free and
  trial-eligible Store plan changes still work (no payment involved), and a plan that genuinely
  needs payment reports "not configured" instead of pretending to charge anyone — see "Store
  subscriptions" below.

### 3. Install and run

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

### Creating an admin account

There's no self-service admin signup (on purpose). Create the *first* admin — yourself — with:

```bash
node --env-file=.env.local scripts/create-admin.mjs --phone 08012345678 --password "a real password" --name "Your Name"
```

(On Node < 20.6, export `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` yourself instead of using
`--env-file`.) Log in with that phone number and password to reach the Admin Queue.

**Every admin after that never needs the terminal.** Once you're in the Admin Queue, its "Team &
admin access" section lets you promote any existing FindIt account to admin by phone number — the
teammate signs up normally (as a buyer, in the app) and you promote that account from there
(`POST /api/admin/promote`), or remove an admin's access again the same way
(`POST /api/admin/demote` — restores whatever role they actually had before being promoted, via
`users.previous_role`). There's deliberately no extra gate above this: any admin can promote or
demote any other account, the same trust level `create-admin.mjs` already had — this just moves it
into the app so only the very first admin ever needs to touch a terminal. Two guards exist because
they protect the platform, not just one action: you can't remove your own admin access (always
needs a second admin), and the last remaining admin can never be demoted (would leave FindIt with
no admin and no in-app way to create another one).

## Code layout

- `supabase/schema.sql` — the full Postgres schema (every table, no seed data). Run this once
  against a fresh Supabase project before starting the app.
- `supabase/migrations/` — incremental scripts for a project set up before a feature existed.
  A fresh install only needs `schema.sql`, which already includes all of them. Run them in
  numeric order in the Supabase SQL Editor:
  `002_add_location.sql` (lat/lng), `003_security_hardening.sql`, `004_phone_verification.sql`,
  `005_profile.sql` (avatar + notification preference), `006_otp_verifications.sql`,
  `007_admin_demote.sql`, `008_delivery_confirmation.sql` (buyer delivery confirmation and
  escrow state — see "Escrow and delivery confirmation" below).
- `scripts/create-admin.mjs` — one-time script to create an admin account directly in Supabase.
- `lib/categories.js` — the fixed category id → label taxonomy (15 categories). Shared by
  `lib/repo.ts` (server-side validation) and `components/findit-app/data.js` (client labels/icons).
  Not seed data — it's the marketplace's category structure, same as any e-commerce site's nav.
- `lib/db.ts` — the Supabase client factory (`getDb()`) used by `lib/repo.ts` and `lib/auth.ts`.
- `lib/repo.ts` — typed query/mutation functions used by the API routes, plus the pure business
  logic they build on (input validation, the forward-only order-status rule, seller-stats
  aggregation) — see "Testing" below for why that split matters.
- `lib/auth.ts` — password hashing (scrypt) and cookie-based sessions (no external auth service;
  Supabase is used only as the database here, not as the auth provider).
- `lib/rateLimit.ts` — a small in-memory sliding-window limiter guarding login/signup/AI classify
  (see "Access control"). Single-process only — fine for this app, not for a multi-instance
  deployment.
- `lib/storage.ts` — uploads product photos to Supabase Storage (server-side only), auto-creating
  the `product-images` bucket on first use.
- `lib/ai.ts` — Gemini request classification (server-side only, `GEMINI_API_KEY`).
- `lib/geo.ts` — pure real-world distance math (`haversineKm`) behind "near you" sorting; no DB or
  browser APIs, so it's shared by server routes and client components alike and unit-tested.
- `components/findit-app/location.js` — the client-side browser geolocation flow (explicit
  permission prompt, localStorage caching); see "Location awareness" below.
- `app/api/**/route.ts` — REST endpoints for products, orders, requests/offers, notifications,
  sellers, messages, saved items, uploads, AI classification, and auth (signup/login/logout/me).
- `components/findit-app/data.js` — client-only presentation data: category icons (paired with
  `lib/categories.js` labels), notification-type icons, gradient swatches, static copy.
- `components/findit-app/api.js` — small fetch wrapper used by the client components.
- `components/findit-app/shared.jsx` — small shared UI primitives (Pill, ArtBlock, Logo, etc).
- `components/findit-app/*.jsx` — one file per screen (Home, Browse, ProductDetail, Checkout,
  RequestForm, MyRequests, SellerDashboard, SellerProfile, AdminQueue, Account, Messages, Thread,
  Notifications, Profile, Splash, Onboarding, Login), plus `MainApp.jsx` (tab bar + screen router +
  data fetching) and `App.jsx` (splash/onboarding/login/main phase machine).

## Access control

Three roles: `buyer`, `seller`, `admin`. The Seller Dashboard requires `seller`; the Admin Queue
requires `admin` — both gated server-side, not just hidden in the UI. `admin` has no public signup
path — see "Creating an admin account" above.

**Placing an order or submitting a request requires login.** Earlier versions of this app allowed
anonymous "guest" orders/requests scoped to a shared bucket — which meant any guest could see every
other guest's orders, since there was no way to tell two anonymous sessions apart. Real checkout
needs a real, identifiable buyer, so that path was removed.

Product listing management, order status advances, and sending an offer are restricted to the
listing's/order's own seller (matched by business name) or an admin. A seller can advance an order
only as far as "Out for delivery" — see "Escrow and delivery confirmation" below. Messaging routes require a
session and check the caller is a participant in the conversation. Notification and review actions
check the row actually belongs to the calling user.

`POST /api/auth/login`, `POST /api/auth/signup`, `POST /api/auth/send-otp`,
`POST /api/auth/resend-otp`, `POST /api/auth/verify-otp`, `POST /api/auth/reset-password`, and
`POST /api/ai/classify-request` are rate-limited — a 429 with a friendly error is returned once the
limit is hit.

## Escrow and delivery confirmation

The app tells buyers, in onboarding, on every product page and at checkout, that their payment is
held by FindIt and only released once **they** confirm the order arrived. Three rules make that
true rather than just copy:

1. **A seller cannot mark their own order delivered.** `SELLER_SETTABLE_STATUSES` (`lib/repo.ts`)
   stops the seller's ladder at "Out for delivery", and `assertSellerCanSetStatus` enforces it in
   `PATCH /api/orders/[id]`. The client mirrors it with `SELLER_STEPS` in
   `components/findit-app/data.js`, but the server is what decides.
2. **Only the buyer reaches "Delivered."** `POST /api/orders/[id]/confirm` → `confirmDelivery()`
   sets the status, stamps `buyer_confirmed_at`, moves `escrow_status` to `released`, and is the
   only thing that unlocks reviewing. The update is conditional on `buyer_confirmed_at` still
   being null, so a double tap can't release the same order twice.
3. **A buyer can stop the clock.** `POST /api/orders/[id]/issue` → `reportOrderIssue()` moves
   `escrow_status` to `disputed` and puts the order in the admin queue instead of completing it.
   An admin resolves it through `POST /api/admin/disputes` — `released` (pay the seller) or
   `refunded` (return the buyer's money) — and both outcomes are written to the admin audit log.

`escrow_status` is `unpaid | held | released | disputed | refunded`. **A real Paystack charge is
now required before it ever reaches `held`** — see "Real marketplace payments" below; nothing above
in this section changed, it's just that "released"/"refunded" now trigger an actual Paystack
Transfer/refund instead of only flipping this column.

## Real marketplace payments

An order starts `payment_status: 'pending'`/`escrow_status: 'unpaid'` and can't advance past
"Awaiting payment" until a real Paystack charge succeeds (`lib/payments.ts#confirmOrderPayment`,
called only from `POST /api/payments/paystack/webhook` once Paystack confirms it — never on a
client-supplied "I paid"). `POST /api/orders/[id]/pay` starts that checkout, mirroring the same
Paystack machinery Store subscriptions and FindIt Pro use.

- **Platform fee.** An append-only, admin-editable `platform_fee_config` table (finance domain,
  `GET`/`PATCH /api/admin/fee-config`) holds the current commission in basis points. The fee is
  snapshotted onto the order (`platform_fee_bps`/`platform_fee_amount`/`seller_payout_amount`)
  the moment it's paid and never recomputed — a later fee change never rewrites what an
  already-paid order was actually charged.
- **Seller payouts.** Once a buyer confirms delivery, `initiateSellerPayout` fires a real Paystack
  Transfer to the seller's bank account (set via `GET`/`PATCH /api/sellers/me/payout-account`,
  resolved against Paystack's real account-name lookup before saving) — or records an honestly
  labeled `manual_required` payout for an admin to settle off-platform if no payout account is on
  file. A database-level `unique(order_id)` on `payouts` makes a double payout impossible.
- **Refunds.** An admin's "refund" decision on a disputed order (`POST /api/admin/disputes`)
  reverses the buyer's real original Paystack charge, not just this column.
- **Admin ledgers.** The "Payments" tab in the Admin queue (finance domain) edits the platform fee
  and shows the real payout ledger (with a "Mark paid" action for the `manual_required` escape
  hatch) — `GET /api/admin/transactions` also exposes the full payment ledger (orders and
  subscriptions) via the API, with no dedicated screen yet.
- **No live Paystack keys exist in this environment.** Every one of the above checks
  `isPaystackConfigured()` first and returns a clear "not configured" result instead of pretending
  to charge or pay anyone — see `.env.example` for `PAYSTACK_SECRET_KEY`.

**Becoming a seller.** Phone numbers are unique per account, so a buyer who later wants to sell
can't just sign up again. `POST /api/auth/become-seller` → `becomeSeller()` converts the existing
account: it creates (or reopens) the `sellers` verification row as `pending` first, then flips the
user's role, so a failure leaves a buyer rather than an unreviewable seller. Admin accounts are
refused — an admin approves sellers, so self-approval is kept off the table.

**Phone verification (OTP)** is optional and off by default. Set `TERMII_API_KEY` (see
`.env.example`) to turn it on — signup and "Forgot password?" then send a real SMS code via
[Termii](https://termii.com) and require it to be verified before the account is created / the
password is reset. With no key set, both flows work exactly as before (no OTP step; "Forgot
password?" shows the original "contact support" message).

FindIt owns the OTP itself end to end — Termii is only ever the SMS delivery channel
(`lib/sms.ts#sendSms`, a plain transactional SMS via Termii's `dnd` route), never a party that
generates, stores, or verifies the code:

- `lib/otp.ts` generates a cryptographically random 6-digit code (`crypto.randomInt`), stores only
  a salted HMAC-SHA256 hash of it (`otp_verifications.otp_hash`/`otp_salt` — see
  `supabase/migrations/006_otp_verifications.sql`), and never logs or returns the plaintext code.
- Every code is scoped to a `purpose` (`"signup"` or `"reset"`) — a code issued for one can't verify
  the other, and `POST /api/auth/send-otp`'s `purpose: "reset"` path never reveals whether a phone
  number has an account (identical response either way; an SMS is only actually sent when one does).
- Expiry, resend cooldown, max resends per code, and max verify attempts per code are all enforced
  server-side against the database record (never trust a client-side countdown) and are
  configurable via `OTP_EXPIRY_MINUTES` / `OTP_RESEND_COOLDOWN_SECONDS` / `OTP_MAX_RESENDS` /
  `OTP_MAX_ATTEMPTS` / `OTP_MAX_REQUESTS_PER_HOUR` (see `.env.example`) — defaults match what's
  described above. Verifying a code atomically marks it used (conditioned on `used = false` in the
  same `UPDATE`), so two concurrent requests with the same correct code can't both succeed.
- Phone numbers are canonicalized to E.164 everywhere (`lib/phone.ts`) — `08012345678`,
  `2348012345678`, and `+2348012345678` all resolve to the same account and the same OTP record,
  Nigeria-first but built to extend to other countries later.
- Admins get an aggregate, non-identifying view of recent OTP activity (codes sent, verified,
  expired unused, wrong attempts, resends) at the bottom of the Admin queue screen
  (`GET /api/admin/otp-stats`) — never plaintext codes, never which phone numbers were involved.

**On Row Level Security:** this app doesn't use Supabase Auth, so Postgres RLS can't be tied to a
logged-in user's identity the way it would with a Supabase-Auth-based app. RLS is enabled on every
table with no policies (default-deny for the `anon`/`authenticated` Postgres roles) as defense in
depth; the real authorization logic — everything described above — lives in the Next.js API route
code, using the service role key server-side only. See the note at the top of `supabase/schema.sql`
for more detail, and if you migrate to Supabase Auth later, that's where real per-user RLS policies
would go.

## Store subscriptions

Every seller account owns exactly one Store subscription — Free by default, provisioned the moment
an account becomes a seller (`ensureDefaultStoreSubscription` in `lib/auth.ts`). Plans are real
database rows (`subscription_plans`), not hard-coded in the frontend, specifically so an admin can
change a price or limit without touching code:

| Plan | Price | Active listings |
| --- | --- | --- |
| Free Seller | ₦0/mo | 10 |
| Basic Store | ₦2,000/mo | 50 |
| Business Store | ₦5,000/mo | 200 |
| Pro Store | ₦10,000/mo | Unlimited |
| FindIt Pro (platform-wide, separate from Store plans) | ₦3,500/mo or ₦35,000/yr | — |

- **Backend-enforced, not just hidden buttons.** `createProduct`/reactivating a listing both call
  `assertCanActivateProduct` (`lib/subscriptions.ts`) before touching the database — a Free seller
  at 10/10 can't create an 11th listing by hitting the API directly, the same way every other limit
  in this app is enforced server-side first.
- **Downgrade never deletes data.** A plan change that tightens the product limit deactivates
  (`products.active = false`) whichever of the seller's own listings are over the new limit —
  oldest listings stay active first — rather than deleting anything. A deactivated listing
  disappears from Home/Browse but still shows on the seller's own dashboard, marked "Hidden — over
  plan limit," until they upgrade again or make room themselves.
- **Trials.** A paid Store plan a seller hasn't already trialed starts a 30-day trial with no
  payment required (`trial_days` on the plan row — admin-editable). This app has no scheduled job
  runner, so instead of a cron sweeping expired trials, a trial (or an unpaid billing period) is
  lazily resolved back to Free the next time that seller's subscription is read — never deleting
  their store or listings, just dropping the plan.
- **Cancelling** takes effect immediately (straight back to Free) rather than "at period end," for
  the same reason: no scheduled job exists here to expire it later, and Free never deletes data, so
  an immediate, honest cancel is more truthful than a promise this codebase can't keep on its own.
- **Paystack.** `lib/paystack.ts` wraps Paystack's REST API directly (no SDK) — initializing a
  transaction, verifying one, and verifying a webhook's HMAC-SHA512 signature
  (`POST /api/payments/paystack/webhook`, which is what actually flips a subscription to `active`
  once a charge succeeds — never trust a client-supplied "I paid"). With no `PAYSTACK_SECRET_KEY`
  set, a plan change that genuinely needs payment returns a clear "not configured" response instead
  of pretending to charge anyone; `POST /api/admin/subscriptions/grant` (admin-only, audit-logged)
  activates a paid plan manually in the meantime — for a seller who paid off-platform, or for
  testing the upgrade flow with no live Paystack account.
- **Admin control.** `GET /api/admin/subscription-plans` / `PATCH /api/admin/subscription-plans/[id]`
  edit any plan's price, limits, or features — no deploy needed. There's no dedicated admin screen
  for this yet (see "Next steps" below); the API is real and usable from a script or a REST client
  today.
- **Pay for it, get it — every plan feature is either real or explicitly not.** Beyond the product
  limit, four more plan features are actually wired to real functionality, computed server-side from
  the seller's *live* plan (`getStorePlanDisplayMap` in `lib/subscriptions.ts`), not shown from
  anything a client sent: **analytics** (a real Store analytics card on the dashboard, computed from
  that seller's own order data — Basic gets this-month totals, Business adds a top product, Pro adds
  a 4-week revenue chart), **store customization** (a real logo/banner upload, gated server-side by
  `assertCanCustomizeStore` and rendered on the public storefront), **featured placement** (Business/
  Pro sellers' listings are stably sorted to the front of Home and Browse — a real reordering buyers
  actually see, layered on top of, not replacing, "near you" distance sort), and the **Pro Store
  badge** (shown next to the seller's name on their own dashboard and their public storefront). A
  plan whose subscription lapses (see "Trials" above) loses every one of these on its very next
  read — nothing lingers past what was actually paid for. **Priority support** has no real system
  behind it yet (no support-ticket routing exists to prioritize) and is shown as "Coming soon" on
  the plan-comparison screen rather than a checkmark — see `components/findit-app/StorePlans.jsx`.

**Not built yet, deliberately out of scope for this pass:** an admin plan-editor screen, real
per-seller storage (MB) metering (`storage_limit_mb` exists on each plan as config/display data
only — nothing in the upload path measures usage against it, and it isn't claimed as a feature to
sellers for exactly that reason), a real priority-support system, and deeper tier-themed storefront
layouts beyond the real logo/banner/Pro badge described above. Boost/featured-listing purchases and
platform transaction fees still have no purchase flow (their pricing has an obvious home — another
admin-editable `subscription_plans`-style table — but nothing built).

## FindIt Pro

A separate, account-wide membership (₦3,500/mo or ₦35,000/yr) — any signed-in account (buyer or
seller) can subscribe, independent of whether that account also has a Store plan. It reuses the same
`subscriptions`/`subscription_plans` tables as Store plans (`owner_type = 'platform'`, `owner_id =
users.id`, plan id `findit_pro`) and the same Paystack checkout machinery, rather than a second,
parallel payment system:

- **Real checkout, real webhook confirmation.** `POST /api/me/subscription` starts a genuine
  Paystack transaction the same way Store checkout does; the subscription only actually activates
  once `POST /api/payments/paystack/webhook` verifies the charge — never on a client-supplied "I
  paid." With no Paystack keys configured, it returns a clear "not configured" response instead
  (see "Golden rule" above) — `POST /api/admin/subscriptions/grant` (now generalized for both Store
  and FindIt Pro) is the same off-platform/testing escape hatch already used for Store plans.
- **Cancelling is immediate**, for the same no-scheduled-job reason as Store plans — see "Store
  subscriptions" above.
- **Pay for it, get it applies here too.** The only benefit currently wired to something real is the
  **FindIt Pro badge** shown on your own Profile screen (`components/findit-app/FindItPro.jsx`).
  **Priority support** is shown as "Coming soon," same as the Store plans' identical claim — no
  support-ticket system exists yet to prioritize. The plan row shares its `analytics_level` /
  `customization_level` / `featured_listing_access` columns with Store plans for schema reasons, but
  none of those correspond to anything a buyer can see, so none of them are shown as a FindIt Pro
  feature — an honest gap, not an oversight.
- **A real bug found and fixed while building this:** a lapsed or cancelled *platform* subscription
  was, before this pass, being routed through the same "revert to Free" logic as a Store plan —
  which would have reassigned it to the `store_free` plan row, a plan of the wrong `kind` entirely.
  Platform subscriptions now resolve to their own terminal `expired`/`cancelled` status instead (see
  `expirePlatformSubscription` in `lib/subscriptions.ts`).

**Not built yet:** a combined-benefit view for an account that has both a Store plan and FindIt Pro,
and the FindIt Pro badge isn't surfaced anywhere buyers interact with sellers (chat, orders) — only
on the subscriber's own Profile screen.

## Seller trust & verification

Separate from the original pending/approved/rejected admin gate on `sellers.status` (which still
controls whether a seller can transact at all — only `rejected` blocks it) is a richer trust layer:
who is this seller, what do they sell, where do they operate, and what real evidence backs that up.
It drives a public **New / Verified / Trusted** badge; it never blocks selling on its own — a brand
new seller can list immediately, exactly as before.

- **The wizard** (`components/findit-app/SellerOnboarding.jsx`, reached from a "Complete your seller
  verification" card on the dashboard) collects seller type, category, description, social/website
  links, location, and evidence (product/shop photos or a business page link) across a few real
  steps with a progress indicator, then submits everything in one call
  (`POST /api/sellers/me/verification`) — nothing is force-required beyond one real detail plus one
  piece of evidence (`canSubmitVerification` in `lib/sellerVerificationLevels.ts`), so a legitimate
  home-based seller with a single product photo and a WhatsApp handle clears it easily.
- **Private data is physically separate, not just RLS-flagged.** A precise shop address, exact
  coordinates, and uploaded evidence live in `seller_verification_details` /
  `seller_verification_evidence` — never on `sellers` itself — specifically because this codebase
  already runs several `select('*')` queries against `sellers`, and this is the one guarantee that
  can't regress by accident later. Evidence photos go into a **private** Supabase Storage bucket
  (`seller-verification`) and are only ever served as short-lived (10 minute) signed URLs, generated
  fresh for the owning seller or an admin — never a public URL, never cached.
- **RLS is enabled with no policies** on both new tables, the same as every other table in this
  schema, for the same reason: no Supabase Auth session here means no `auth.uid()` to key a real
  policy on. The actual boundary — a seller sees only their own submission, evidence reaches only
  the owning seller or an admin — is enforced in the Next.js API layer.
- **Trusted is computed, not declared.** `computeVerificationLevel` (`lib/sellerVerificationLevels.ts`,
  unit tested) requires an actual admin approval first, then a real track record on top: at least 10
  completed orders (by escrow outcome, not just reviewed ones — most buyers never leave a review),
  zero disputed orders ever, and a buyer rating of 4+ where one exists. A seller who racks up orders
  without ever being reviewed stays "New," never "Trusted" — the whole point is never claiming a
  level FindIt hasn't actually earned or checked.
- **Admin review** is a separate queue in the Admin Queue screen ("Seller trust verification," below
  the basic account-approval list) — approve, ask for more information, or reject, each with a
  reason shown back to the seller (never a silent rejection) and logged to the admin audit trail
  like every other high-impact admin action here.
- **Public display**: the storefront (`SellerProfile.jsx`) shows the New/Verified/Trusted badge
  (tap it for what it means), a coarse public area/city/state (never the private shop address), and
  "On FindIt since" from the account's real creation date.
- **Email** (`users.email`, optional) was added mainly so a real address can back Paystack
  transactions instead of the synthetic one `lib/paystack.ts` falls back to — this app is still
  phone-first, email is never required to log in.

**Not built yet, deliberately out of scope for this pass:** a map-picker for coordinates (a "use my
current location" button covers the common case), a resubmission-history view beyond "reopen the
wizard, see the last rejection reason," ID/document verification specifically (evidence today is
photos and links, not a government ID upload), and admin-configurable Trusted thresholds
(`TRUSTED_MIN_ORDERS`/`TRUSTED_MIN_RATING` are constants for now, not a `subscription_plans`-style
editable row — revisit once there's enough real order volume to tune them against).

## Image uploads

Product photos are stored in Supabase Storage. The `product-images` bucket is created
automatically the first time a seller uploads a photo — no manual setup beyond the env vars in
"Configure environment variables" above. Without `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` set,
everything else in the app still fails to start (they're required for the database too now, not
just uploads).

## AI request classification

Optional. With `GEMINI_API_KEY` set, the "Suggest title, category & budget with AI" button on the
request form sends the buyer's description to Gemini and gets back a structured suggestion
(constrained to the app's real 15 categories) to prefill the form — the buyer can still edit
anything before submitting. Without the key set, clicking the button shows a clear error instead of
a fake response.

## Location awareness

FindIt doesn't hardcode a city — every "near you" result is computed from real coordinates, and
the same logic works anywhere in the world.

- **Nothing is collected until you tap Allow.** The app never auto-requests location on load; a
  small dismissible prompt (on Home) is the only way to grant it, and denying it is a fully
  supported, permanent state — the app just falls back to today's recency-based ordering instead
  of distance, exactly like before this feature existed.
- **What's stored:** just a lat/lng pair, on `users` (your account, synced across devices once
  granted), `products` (captured from the seller's location when a listing is created/edited), and
  `requests` (captured from the buyer's location when a request is submitted). See
  `supabase/schema.sql`/`supabase/migrations/002_add_location.sql`.
- **How "near you" is computed:** real great-circle distance (`lib/geo.ts#haversineKm`, unit
  tested) between your coordinates and a listing's/request's coordinates — sorted nearest-first on
  Browse, Home, and the seller dashboard's open-requests queue. No city/area name is ever derived
  or shown — the UI only ever says "near you," which is also why raw coordinates are never
  displayed anywhere in the interface.
- **Deliberately not built (yet):** reverse geocoding (turning coordinates into a city name like
  "Lagos" or "Jos"), and a manual "type your city" fallback for buyers who deny location. Both
  would need a new external geocoding API — a real infrastructure decision I didn't want to make
  silently. The existing free-text "Delivery note" field on a request is the current manual
  fallback (context for a seller, not something the app geocodes or sorts by). If you want a real
  manual-location fallback later, that's the one place a geocoding service would plug in.

## Testing

```bash
npm test
```

Runs the Vitest suite (`lib/**/*.test.ts`). Since the database is now a real Supabase Postgres
project rather than a local SQLite file, and this environment may not have network access to
Supabase, the automated tests cover the real business logic that doesn't require a live database —
input validation (listings, offers), the forward-only order-status rule, seller-stats aggregation
math, password hashing, phone normalization (`lib/phone.ts`), OTP code generation/hashing/config
(`lib/otp.ts`), the real-world distance math behind "near you", which listings a Store plan
downgrade deactivates (`selectProductsToDeactivate` in `lib/subscriptions.ts` — oldest kept active
first, nothing ever deleted), and how a seller's New/Verified/Trusted level and minimum-evidence bar
are computed (`computeVerificationLevel`/`canSubmitVerification` in
`lib/sellerVerificationLevels.ts`) — extracted into pure, directly-testable functions in
`lib/repo.ts`/`lib/auth.ts`/`lib/phone.ts`/`lib/otp.ts`/`lib/geo.ts`/`lib/subscriptions.ts`/
`lib/sellerVerificationLevels.ts`.
The database-touching paths (signup/login, creating orders, accepting offers, messaging, the full
OTP send/verify/resend cycle against `otp_verifications`, saving a product's/request's location,
etc.) need to be verified by actually running the app against a real Supabase project, the same way
you'd test any app whose database lives outside your own machine. The OTP UI flow (6-digit entry,
countdown, resend, error states) was verified end-to-end with mocked API responses via Playwright,
the same way the rest of this app's UI has been throughout this project.

## Next steps toward a real product

Real hosting/deployment (see the note in "Testing" — this repo has never been deployed to a live
host), and a real seller ID/document verification system (currently admin approval is a judgment
call, not a document check). Phone verification (OTP) at signup and password reset is fully built
(see "Security" above) but needs a real `TERMII_API_KEY` to turn on, and the actual SMS send/deliver
path has not been tested against Termii's live API from this environment (no network access here to
termii.com — the integration in `lib/sms.ts` is built from Termii's current published v4 API
documentation, not tested against a live account) — verify it end-to-end once a key is added.
Order payments, platform fees, seller payouts, refunds, Store subscriptions, and FindIt Pro are all
real and Paystack-wired now (see "Real marketplace payments", "Store subscriptions", and "FindIt
Pro" above) — every one of them needs a real `PAYSTACK_SECRET_KEY` to actually move money (the
integration is server-to-server REST, redirecting to Paystack's hosted checkout page, so no
client-side public key is used); with none configured they degrade to clearly labeled "not configured" states
rather than pretending to charge or pay anyone. Still not built: an admin plan-editor screen, real
per-seller storage metering, tier-themed public storefronts, a combined-benefit view for an account
with both a Store plan and FindIt Pro, and boost/featured-listing purchases with platform
transaction fees (the database/plan-config shape has room for them, but no purchase flow exists).
