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
  immediately enters the admin verification queue. There is no "Continue as guest" for anything
  that creates data (placing an order, submitting a request) — see "Access control" for why.
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
- **Notifications** — real, per-account. You're notified when a seller sends a real offer on your
  request. Mark one or all as read.
- **Profile** — shows your real name/phone/role with a working log out, plus entry points into
  your orders, requests, messages, and notifications.
- **Product photos** — sellers can attach a real photo to a listing (add or edit), stored in
  Supabase Storage; falls back to a generated gradient icon for listings without one.
- **Location** — FindIt is not tied to any one city. With permission, the app uses your device's
  real coordinates to sort listings, sellers, and (for sellers) open requests by actual distance —
  "near you" works the same whether you're in Lagos, Nairobi, or anywhere else. See "Location
  awareness" below.

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

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in:

- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — Settings → API in your Supabase project. The
  service role key has full access to your database; it's used server-side only and is never sent
  to the browser.
- `GEMINI_API_KEY` — from [ai.google.dev](https://ai.google.dev) ("Get API key"). Optional: without
  it, everything else works, and the AI-suggest button on the request form shows a clear error
  instead of a fake response.

### 3. Install and run

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

### Creating an admin account

There's no self-service admin signup (on purpose). Create the first one with:

```bash
node --env-file=.env.local scripts/create-admin.mjs --phone 08012345678 --password "a real password" --name "Your Name"
```

(On Node < 20.6, export `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` yourself instead of using
`--env-file`.) Log in with that phone number and password to reach the Admin Queue.

## Code layout

- `supabase/schema.sql` — the full Postgres schema (every table, no seed data). Run this once
  against a fresh Supabase project before starting the app.
- `supabase/migrations/002_add_location.sql` — adds `lat`/`lng` columns for location awareness;
  only needed if you set up your Supabase project before that feature existed (`schema.sql` already
  includes them for a fresh install).
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
listing's/order's own seller (matched by business name) or an admin. Messaging routes require a
session and check the caller is a participant in the conversation. Notification and review actions
check the row actually belongs to the calling user.

`POST /api/auth/login`, `POST /api/auth/signup`, and `POST /api/ai/classify-request` are rate-
limited — a 429 with a friendly error is returned once the limit is hit. This doesn't cover phone
verification (OTP) at signup, since that needs a real SMS provider — same "needs external setup"
category as payments below.

**On Row Level Security:** this app doesn't use Supabase Auth, so Postgres RLS can't be tied to a
logged-in user's identity the way it would with a Supabase-Auth-based app. RLS is enabled on every
table with no policies (default-deny for the `anon`/`authenticated` Postgres roles) as defense in
depth; the real authorization logic — everything described above — lives in the Next.js API route
code, using the service role key server-side only. See the note at the top of `supabase/schema.sql`
for more detail, and if you migrate to Supabase Auth later, that's where real per-user RLS policies
would go.

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
math, password hashing, phone normalization, and the real-world distance math behind "near you" —
extracted into pure, directly-testable functions in `lib/repo.ts`/`lib/auth.ts`/`lib/geo.ts`. The
database-touching paths (signup/login, creating orders, accepting offers, messaging, saving a
product's/request's location, etc.) need to be verified by actually running the app against a real
Supabase project, the same way you'd test any app whose database lives outside your own machine.

## Next steps toward a real product

A real Nigerian payment processor (e.g. Paystack or Flutterwave) for the escrow flow, real hosting/
deployment (see the note in "Testing" — this repo has never been deployed to a live host), phone
number verification (OTP) at signup, and a real seller ID/document verification system (currently
admin approval is a judgment call, not a document check).
